import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';

/** Acceso tipado a la configuración. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get paymentInstructions() {
    return {
      accountHolder: this.get('PAYMENT_ACCOUNT_HOLDER'),
      nequi: this.get('PAYMENT_NEQUI_NUMBER'),
      daviplata: this.get('PAYMENT_DAVIPLATA_NUMBER'),
      bank: this.get('PAYMENT_BANK_INFO'),
    };
  }

  get sender() {
    return {
      name: this.get('SENDER_NAME'),
      phone: this.get('SENDER_PHONE'),
      cityCode: this.get('SENDER_CITY_CODE'),
      address: this.get('SENDER_ADDRESS'),
      document: this.get('SENDER_DOCUMENT'),
    };
  }
}
