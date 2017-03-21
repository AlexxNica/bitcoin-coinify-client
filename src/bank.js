'use strict'

var assert = require('assert');

module.exports = Bank;

function Bank (api, delegate) {
  this._api = api;
  this._delegate = delegate;
}

Bank.prototype.create = function (bankObj) {
  assert(bankObj.account.currency, 'Currency required')
  assert(bankObj.holder.name, 'Bank account holder name required')
  assert(bankObj.holder.address.country, 'Bank country required')
  assert(bankObj.account.number, 'IBAN required')

  const b = {
    account: {
      currency: bankObj.account.currency,
      bic: bankObj.account.bic,
      number: bankObj.account.number
    },
    holder: {
      name: bankObj.holder.name,
      address: {
        street: bankObj.holder.address.street,
        city: bankObj.holder.address.city,
        zipcode: bankObj.holder.address.zipcode,
        country: bankObj.holder.address.country,
        state: bankObj.holder.address.state || null
      }
    },
    bank: {
      name: bankObj.bank.name || null,
      address: {
        country: bankObj.bank.address.country,
        street: bankObj.bank.address.street || null,
        zipcode: bankObj.bank.address.zipcode || null,
        city: bankObj.bank.address.city || null
      }
    }
  }
  return this._api.authPOST('bank-accounts', b)
    .then((res) => {
      console.log('from bank class', res)
      return res
    })
    .catch((err) => console.log('ERR creating bank', err))
}

  // create (bankObj) {
  //   assert(bankObj._currency, 'Currency required')
  //   assert(bankObj._holder_name, 'Bank account holder name required')
  //   assert(bankObj._bank_address._country, 'Bank country required')
  //
  //   const b = {
  //     account: {
  //       currency: bankObj._currency,
  //       bic: bankObj._bic,
  //       number: bankObj._number
  //     },
  //     holder: {
  //       name: bankObj._holder_name,
  //       address: {
  //         street: bankObj._holder_address._street,
  //         city: bankObj._holder_address._city,
  //         zipcode: bankObj._holder_address._zipcode,
  //         country: bankObj._holder_address._country,
  //         state: bankObj._holder_address._state
  //       }
  //     },
  //     bank: {
  //       name: bankObj._bank_name,
  //       address: {
  //         country: bankObj._bank_address._country,
  //         street: null,
  //         zipcode: null,
  //         city: null
  //       }
  //     }
  //   }
  //   return this._api.authPOST('bank-accounts', b)
  //     .then((res) => {
  //       console.log('from bank class', res)
  //       return res
  //     })
  //     .catch((err) => console.log('ERR creating bank', err))
  //
  // }

  Bank.prototype.getAll = function () {
    if (!this._delegate.isEmailVerified()) {
      return;
    }
    return this._api.authGET('bank-accounts')
  }

  // getAll () {
  //   return this._api.authGET('bank-accounts')
  // }

  Bank.prototype.getOne = function (id) {
    return this._api.authGET(`bank-accounts/${id}`).then((result) => {
      console.log('bank getOne result', result)
      return result;
    })
  }

  // getOne (id) {
  //   assert(id, 'bankAccount ID required')
  //   return this._api.authGET(`bank-accounts/${id}`)
  // }

  Bank.prototype.deleteOne = function (id) {
    assert(id, 'bankAccount ID required')
    return this._api.DELETE(`bank-accounts/${id}`)
  }

  // deleteOne (id) {
  //   assert(id, 'bankAccount ID required')
  //   return this._api.DELETE(`bank-accounts/${id}`)
  // }

// }
