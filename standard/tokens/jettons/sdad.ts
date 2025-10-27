import { Address, beginCell, internal, SendMode, toNano } from "@ton/core";
import { TonClient, WalletContractV5R1, TupleItemSlice } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// a list of 24 space-separated words
const mnemonic = "foo bar baz";
const apiKey = "<API key>";
const jettonMasterAddress = Address.parse(
    "<Jetton master address>",
);
const destinationRegularWalletAddress = Address.parse(
    "<destination wallet address>",
);

async function main() {
    // connect to your regular walletV5
    const client = new TonClient({
        endpoint: "https://toncenter.com/api/v2/jsonRPC",
        apiKey,
    });

    const keyPair = await mnemonicToPrivateKey(mnemonic.split(" "));
    const walletContract = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    const provider = client.provider(walletContract.address);


    // Find your Jetton wallet Address
    const walletAddressCell = beginCell()
        .storeAddress(walletContract.address)
        .endCell();
    const el: TupleItemSlice = {
        type: "slice",
        cell: walletAddressCell,
    };
    const data = await client.runMethod(
        jettonMasterAddress,
        "get_wallet_address",
        [el],
    );
    const jettonWalletAddress = data.stack.readAddress();

    // form the transfer message
    const forwardPayload = beginCell()
        .storeUint(0, 32) // 0 opcode means we have a comment
        .storeStringTail("for coffee")
        .endCell();

    const messageBody = beginCell()
        // opcode for jetton transfer
        .storeUint(0x0f8a7ea5, 32)
        // query id
        .storeUint(0, 64)
        // jetton amount, amount * 10^9
        .storeCoins(toNano(5))
        // the address of the new jetton owner
        .storeAddress(destinationRegularWalletAddress)
        // response destination (in this case, the destination wallet)
        .storeAddress(destinationRegularWalletAddress)
        // no custom payload
        .storeBit(0)
        // forward amount - if >0, will send notification message
        .storeCoins(toNano("0.02"))
        // store forwardPayload as a reference
        .storeBit(1)
        .storeRef(forwardPayload)
        .endCell();

    const transferMessage = internal({
        to: jettonWalletAddress,
        value: toNano("0.1"),
        bounce: true,
        body: messageBody,
    });

    // send the transfer message through your wallet
    const seqno = await walletContract.getSeqno(provider);
    await walletContract.sendTransfer(provider, {
        seqno: seqno,
        secretKey: keyPair.secretKey,
        messages: [transferMessage],
        sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
}

void main();