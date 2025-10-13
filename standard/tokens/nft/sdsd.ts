import { Address, toNano } from "@ton/core";

import { WalletContractV5R1, TonClient } from "@ton/ton";

import { mnemonicToPrivateKey } from "@ton/crypto";

import {
    AssetsSDK,
    createApi,
    PinataStorageParams,
} from "@ton-community/assets-sdk";


async function main() {

    const client = new TonClient({
    endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    });

    const keyPair = await mnemonicToPrivateKey(['dsadasdadasdasdasdasdasdasdasdad'])

    const walet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey
    }
    );

    const provider = client.provider(walet.address);

    const sender = walet.sender(provider, keyPair.secretKey);

    const NETWORK = "testnet";
    const api = await createApi(NETWORK);

    const storage: PinataStorageParams = {
        pinataApiKey: process.env.PINATA_API_KEY!,
        pinataSecretKey: process.env.PINATA_SECRET!,
    };

    const sdk = AssetsSDK.create({
        api,
        storage,
        sender,
    });

    const NFT_ADDRESS = Address.parse("put your NFT item address");
    const nftItem = await sdk.openNftItem(NFT_ADDRESS);

    const RECEIVER_ADDRESS = Address.parse("put receiver address");
    await nftItem.send(sender, RECEIVER_ADDRESS, { value: toNano(10) });
}

void main();