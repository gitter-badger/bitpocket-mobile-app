import {Injectable, Injector} from '@angular/core';
import {BitcoinUnit} from '../currency/bitcoin-unit';
import * as payment from '../../api/payment-service';
import {PaymentRequest} from '../../api/payment-request';
import {Transaction} from '../../api/transaction';
import {History} from '../history/history';
import {EventEmitter} from 'events';

// Payment Services
import {ElectrumPaymentService} from './electrum';

@Injectable()
export class Payment extends EventEmitter {
    
    private active: boolean = false;    
    private waitingTimeCount: number = 0;

    // TODO: check if this should be configurable
    private checkInterval: number = 4000;
    private maxWaitingTime: number = 1000 * 60;

    private service: payment.PaymentService;
    
    constructor(private injector: Injector, private history: History) {        
        super();
        this.service = this.injector.get(ElectrumPaymentService);
    }
    
    checkPayment(paymentRequest: PaymentRequest) {
        if (this.waitingTimeCount > this.maxWaitingTime) {
            this.emit('payment-status:' + payment.PAYMENT_STATUS_TIMEOUT, paymentRequest);
            return;
        } else if (this.active) {
            this.waitingTimeCount += this.checkInterval;
        } else {
            // this.active == false , or any other reason abort
            // TODO: do we need an event?
            return;
        }

        this.service.findTransactions(
            paymentRequest.address,
            BitcoinUnit.from(paymentRequest.bitcoinAmount, 'BTC'))
            .then((txids) => {
                this.history.findNewTransaction(txids, paymentRequest.address)
                    .then(index => { 
                        if (index > 0) {
                            let transaction: Transaction = {
                                txid : txids[index] ,
                                address : paymentRequest.address ,
                                currency : paymentRequest.currency ,
                                bitcoinAmount : paymentRequest.bitcoinAmount ,
                                fiatAmount : paymentRequest.fiatAmount
                            };

                            this.emit('payment-status:' + payment.PAYMENT_STATUS_RECEIVED, transaction);
                        } else {
                            this.emit('payment-status:' + payment.PAYMENT_STATUS_NOT_RECEIVED, paymentRequest);
                            setTimeout(this.checkPayment, this.checkInterval);
                        }
                     });
            })
            .catch(() => {
                this.emit('payment-status:' + payment.PAYMENT_STATUS_NOT_RECEIVED, paymentRequest);
                setTimeout(this.checkPayment, this.checkInterval);
            });

        return this;
    }

    startPaymentStatusCheck(paymentRequest: PaymentRequest) {
        this.removeAllListeners();
        this.active = true;
        this.waitingTimeCount = 0;
        this.checkPayment(paymentRequest);        

        return this;
    }

    stopPaymentStatusCheck() {
        this.removeAllListeners();
        this.active = false;

        return this;
    }
    
}
