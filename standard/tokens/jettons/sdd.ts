import { Address, toNano, WalletContractV5R1, TonClient } from "@ton/ton";

import { mnemonicToPrivateKey } from "@ton/crypto";

import {
    AssetsSDK,
    createApi,
} from "@ton-community/assets-sdk";

async function main() {
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
        apiKey: "your api_key here, see https://beta-docs.ton.org/ecosystem/rpc/toncenter/get-api-key",
    });

    const your_mnemonic = "put your mnemonic here, ...";
    const keyPair = await mnemonicToPrivateKey(your_mnemonic.split(" "));

    const wallet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const provider = client.provider(wallet.address);
    const sender = wallet.sender(provider, keyPair.secretKey);

    const NETWORK = "testnet";
    const api = await createApi(NETWORK);

    const sdk = AssetsSDK.create({
        api,
        sender,
    });

    const JETTON_ADDRESS = Address.parse('MY_JETTON_ADDRESS');
    const jetton = await sdk.openJetton(JETTON_ADDRESS);

    const RECEIVER_ADDRESS = Address.parse('RECEIVER_ADDRESS');
    const myJettonWallet = await jetton.getWallet(sdk.sender!.address!);
    await myJettonWallet.send(sender, RECEIVER_ADDRESS, toNano(10));
}

void main();