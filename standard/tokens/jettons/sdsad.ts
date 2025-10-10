import { Address } from '@ton/core';

import { AssetsSDK, PinataStorageParams, createApi, createSender, importKey } from "@ton-community/assets-sdk";

async function main() {
    const NETWORK = 'testnet';
    const api = await createApi(NETWORK);

    const keyPair = await importKey(process.env.MNEMONIC!);
    const sender = await createSender('highload-v2', keyPair, api);

    const storage: PinataStorageParams = {
        pinataApiKey: process.env.PINATA_API_KEY!,
        pinataSecretKey: process.env.PINATA_SECRET!,
    };

    const sdk = AssetsSDK.create({
        api: api,
        storage: storage,
        sender: sender,
    });

    const JETTON_ADDRESS = Address.parse('MY_JETTON_ADDRESS');
    const jetton = sdk.openJettonWallet(JETTON_ADDRESS);

    const RECEIVER_ADDRESS = Address.parse('RECEIVER_ADDRESS');
    await jetton.sendBurn(sender, 1200000n);
}

void main();