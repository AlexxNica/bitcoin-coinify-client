'use strict';

var assert = require('assert');

var BankAccount = require('./bank-account');
var Helpers = require('bitcoin-exchange-client').Helpers;

var Exchange = require('bitcoin-exchange-client');

class Trade extends Exchange.Trade {
  constructor (obj, api, delegate) {
    super(api, delegate);

    assert(obj, 'JSON missing');
    this._id = obj.id;
    this.set(obj);
  }

  get iSignThisID () { return this._iSignThisID; }

  get quoteExpireTime () { return this._quoteExpireTime; }

  get bankAccount () { return this._bankAccount; }

  get updatedAt () { return this._updatedAt; }

  get receiptUrl () { return this._receiptUrl; }

  get isBuy () {
    if (Boolean(this._is_buy) === this._is_buy) {
      return this._is_buy;
    } else if (this._is_buy === undefined && this.outCurrency === undefined) {
      return true; // For older test wallets, can be safely removed later.
    } else {
      return this.outCurrency === 'BTC';
    }
  }

  set (obj) {
    if ([
      'awaiting_transfer_in',
      'processing',
      'reviewing',
      'completed',
      'completed_test',
      'cancelled',
      'rejected',
      'expired'
    ].indexOf(obj.state) === -1) {
      console.warn('Unknown state:', obj.state);
    }
    if (this._isDeclined && obj.state === 'awaiting_transfer_in') {
      // Coinify API may lag a bit behind the iSignThis iframe.
      this._state = 'rejected';
    } else {
      this._state = obj.state;
    }
    this._is_buy = obj.is_buy;

    this._inCurrency = obj.inCurrency;
    this._outCurrency = obj.outCurrency;

    if (obj.transferIn) {
      this._medium = obj.transferIn.medium;
      this._sendAmount = this._inCurrency === 'BTC'
        ? Helpers.toSatoshi(obj.transferIn.sendAmount)
        : Helpers.toCents(obj.transferIn.sendAmount);
    }

    if (this._inCurrency === 'BTC') {
      this._inAmount = Helpers.toSatoshi(obj.inAmount);
      this._outAmount = Helpers.toCents(obj.outAmount);
      this._outAmountExpected = Helpers.toCents(obj.outAmountExpected);
    } else {
      this._inAmount = Helpers.toCents(obj.inAmount);
      this._outAmount = Helpers.toSatoshi(obj.outAmount);
      this._outAmountExpected = Helpers.toSatoshi(obj.outAmountExpected);
    }

    // for sell trades - need bank info
    if (obj.transferIn) {
      if (obj.transferIn.medium === 'blockchain') {
        var o = obj.transferOut.details.account.number;
        this._bankName = obj.transferOut.details.bank.name;
        this._lastFourBankAccountDigits = o.substring(o.length, o.length - 6);
      }
    }

    if (obj.confirmed === Boolean(obj.confirmed)) {
      this._delegate.deserializeExtraFields(obj, this);
      this._receiveAddress = this._delegate.getReceiveAddress(this);
      this._confirmed = obj.confirmed;
      this._txHash = obj.tx_hash;
    } else { // Contructed from Coinify API
      /* istanbul ignore if */
      if (this.debug) {
        // This log only happens if .set() is called after .debug is set.
        console.info('Trade ' + this.id + ' from Coinify API');
      }
      this._createdAt = new Date(obj.createTime);
      this._updatedAt = new Date(obj.updateTime);
      this._quoteExpireTime = new Date(obj.quoteExpireTime);
      this._receiptUrl = obj.receiptUrl;

      if (this._inCurrency !== 'BTC') {
        // NOTE: this field is currently missing in the Coinify API:
        if (obj.transferOut && obj.transferOutdetails && obj.transferOutdetails.transaction) {
          this._txHash = obj.transferOutdetails.transaction;
        }

        if (this._medium === 'bank') {
          this._bankAccount = new BankAccount(obj.transferIn.details);
        }

        this._receiveAddress = obj.transferOut.details.account;
        this._iSignThisID = obj.transferIn.details.paymentId;
      }
    }
    return this;
  }

  cancel () {
    var self = this;

    var processCancel = function (trade) {
      self._state = trade.state;

      self._delegate.releaseReceiveAddress(self);

      return self._delegate.save.bind(self._delegate)();
    };

    return self._api.authPATCH('trades/' + self._id + '/cancel').then(processCancel);
  }

  btcExpected () {
    if (this.isBuy) {
      if ([
        'completed',
        'completed_test',
        'cancelled',
        'failed',
        'rejected'
      ].indexOf(this.state) > -1) {
        return Promise.resolve(this.outAmountExpected);
      }

      var oneMinuteAgo = new Date(new Date().getTime() - 60 * 1000);
      if (this.quoteExpireTime > new Date()) {
        // Quoted price still valid
        return Promise.resolve(this.outAmountExpected);
      } else {
        // Estimate BTC expected based on current exchange rate:
        if (this._lastBtcExpectedGuessAt > oneMinuteAgo) {
          return Promise.resolve(this._lastBtcExpectedGuess);
        } else {
          var processQuote = (quote) => {
            this._lastBtcExpectedGuess = quote.quoteAmount;
            this._lastBtcExpectedGuessAt = new Date();
            return this._lastBtcExpectedGuess;
          };
          return this._getQuote(this._api, this._delegate, -this.inAmount, this.inCurrency, this.outCurrency, this._debug).then(processQuote);
        }
      }
    } else {
      return Promise.reject();
    }
  }

  sell (quote, bank) {
    assert(quote, 'Quote required');
    assert(quote.expiresAt > new Date(), 'QUOTE_EXPIRED');
  }

  // QA tool:
  fakeBankTransfer () {
    var self = this;

    return self._api.authPOST('trades/' + self._id + '/test/bank-transfer', {
      sendAmount: parseFloat((self.inAmount / 100).toFixed(2)),
      currency: self.inCurrency
    }).then(this._delegate.save.bind(this._delegate));
  }

  // QA tool:
  expireQuote () {
    this._quoteExpireTime = new Date(new Date().getTime() + 3000);
  }

  static buy (quote, medium) {
    const request = (receiveAddress) => {
      return quote.api.authPOST('trades', {
        priceQuoteId: quote.id,
        transferIn: {
          medium: medium
        },
        transferOut: {
          medium: 'blockchain',
          details: {
            account: receiveAddress
          }
        }
      });
    };
    return super.buy(quote, medium, request);
  }

  static fetchAll (api) {
    return api.authGET('trades');
  }

  process () {
    if (['rejected', 'cancelled', 'expired'].indexOf(this.state) > -1) {
      /* istanbul ignore if */
      if (this.debug) {
        console.info('Check if address for ' + this.state + ' trade ' + this.id + ' can be released');
      }
      this._delegate.releaseReceiveAddress(this);
    }
  }

  refresh () {
    /* istanbul ignore if */
    if (this.debug) {
      console.info('Refresh ' + this.state + ' trade ' + this.id);
    }
    return this._api.authGET('trades/' + this._id)
            .then(this.set.bind(this))
            .then(this._delegate.save.bind(this._delegate))
            .then(this.self.bind(this));
  }

  // Call this if the iSignThis iframe says the card is declined. It may take a
  // while before Coinify API reflects this change
  declined () {
    this._state = 'rejected';
    this._isDeclined = true;
  }

  toJSON () {
    var serialized = {
      id: this._id,
      state: this._state,
      tx_hash: this._txHash,
      confirmed: this.confirmed,
      is_buy: this.isBuy
    };

    this._delegate.serializeExtraFields(serialized, this);

    return serialized;
  }
}

module.exports = Trade;
