export const FeePlayground = () => {
  const nano = 10 ** -9;
  const bit16 = 2 ** 16;
  const Note = ({ title, children }) => (
    <div className="my-3 px-4 py-3 rounded-2xl border border-sky-500/20 bg-sky-50/50 dark:border-sky-500/30 dark:bg-sky-500/10">
      {title && (
        <div className="text-xs font-semibold text-sky-900 dark:text-sky-200 mb-1">
          {title}
        </div>
      )}
      <div className="text-xs text-sky-900 dark:text-sky-200">
        {children}
      </div>
    </div>
  );

  const compute = (form) => {
    const presets = {
      // #25 - Messages prices (basechain)
      basechain: {
        lump_price: 400000,
        bit_price: 26214400,
        cell_price: 2621440000,
        first_frac: 21845,
        next_frac: 21845,
      },
      // #24 - Masterchain messages prices
      masterchain: {
        lump_price: 10000000,
        bit_price: 655360000,
        cell_price: 65536000000,
        first_frac: 21845,
        next_frac: 21845,
      },
    };
    const storagePrices = {
      basechain: { bit_ps: 1, cell_ps: 500 },
      masterchain: { bit_ps: 1000, cell_ps: 500000 },
    };

    const net = form.network.value === 'masterchain' ? 'masterchain' : 'basechain';
    const { lump_price: lumpPrice, bit_price: bitPrice, cell_price: cellPrice, first_frac: firstFrac } = presets[net];

    const importBits = Number(form.import_bits.value || 0);
    const importCells = Number(form.import_cells.value || 0);
    const fwdBits = Number(form.fwd_bits.value || 0);
    const fwdCells = Number(form.fwd_cells.value || 0);

    const gasFeesTon = Number(form.gas_fees_ton.value || 0);

    // Account storage parameters
    const accountBits = Number(form.account_bits.value || 0);
    const accountCells = Number(form.account_cells.value || 0);
    const { bit_ps, cell_ps } = storagePrices[net];

    const timeDelta = Number(form.time_delta.value || 69);

    // Compute storage fee from account params (nanotons)
    const storageFeeNano = Math.ceil(((accountBits * bit_ps + accountCells * cell_ps) * timeDelta) / bit16);
    const storageFeesTon = storageFeeNano * nano;
    // storage fee is displayed in the results area only

    const fwdFee = lumpPrice + Math.ceil((bitPrice * fwdBits + cellPrice * fwdCells) / bit16);
    const totalFwdFees = fwdFee;
    const totalActionFees = +((fwdFee * firstFrac) / bit16).toFixed(9);
    const importFee = lumpPrice + Math.ceil((bitPrice * importBits + cellPrice * importCells) / bit16);
    const totalFeeTon = gasFeesTon + storageFeesTon + importFee * nano + totalFwdFees * nano;

    const setOut = (key, value) => {
      const el = form.querySelector(`[data-out="${key}"]`);
      if (el) el.textContent = value;
    };

    setOut('total', totalFeeTon.toFixed(9));
    setOut('action', (totalActionFees * nano).toFixed(9));
    setOut('fwd', (totalFwdFees * nano).toFixed(9));
    setOut('import', (importFee * nano).toFixed(9));
    setOut('gas', gasFeesTon.toFixed(9));
    setOut('storage', storageFeesTon.toFixed(9));
  };

  const init = (node) => {
    if (node) compute(node);
  };

  return (
    <form ref={init} onInput={(e) => compute(e.currentTarget)} className="not-prose my-4 p-4 border rounded-xl dark:border-white/20 border-black/10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs">Network</div>
        <div>
          <select name="network" defaultValue="basechain" className="border rounded-md px-2 py-1 bg-transparent text-sm">
            <option value="basechain">Basechain</option>
            <option value="masterchain">Masterchain</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Import Payload</h4>
          <label className="block text-xs">import bits
            <input name="import_bits" defaultValue={528} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
          <label className="block text-xs">import cells
            <input name="import_cells" defaultValue={1} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
        </div>

        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Forward Payload</h4>
          <label className="block text-xs">fwd bits
            <input name="fwd_bits" defaultValue={0} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
          <label className="block text-xs">fwd cells
            <input name="fwd_cells" defaultValue={0} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="font-semibold text-sm">Account storage</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block text-xs">bits
            <input name="account_bits" defaultValue={1323} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
          <label className="block text-xs">cells
            <input name="account_cells" defaultValue={3} className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
          <label className="block text-xs">time delta from Prev. tx (sec)
            <input name="time_delta" defaultValue="69" className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" step="0.00001" />
          </label>
        </div>
        <Note title="Where to get payload sizes?">
          You can find import, forward and storage parameters in the Executor logs (txtracer/retracer) for a specific transaction.
        </Note>
      </div>

      <div className="mt-4">
        <h4 className="font-semibold text-sm">Compute fee</h4>
        <Note title="Why enter gas manually?">
          The compute (gas) cost cannot be predicted by a static formula. <br />
          Measure it in tests or read it from the executor logs / explorer, then enter the gas fee here.
        </Note>
        <div className="grid grid-cols-1 gap-3">
          <label className="block text-xs">Gas fee (TON)
            <input name="gas_fees_ton" defaultValue="0.0011976" step="0.000000001" className="mt-1 w-full border rounded-md px-2 py-1 bg-transparent" type="number" />
          </label>
        </div>
      </div>

      <div className="mt-4 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <div>Fwd. fee: <strong><span data-out="fwd"></span> TON</strong></div>
          <div>Gas fee: <strong><span data-out="gas"></span> TON</strong></div>
          <div>Storage fee: <strong><span data-out="storage"></span> TON</strong></div>
          <div>Action fee: <strong><span data-out="action"></span> TON</strong></div>
        </div>
        <div className="space-y-1">
          <div>Import fee: <strong><span data-out="import"></span> TON</strong></div>
          <div>Total fee: <strong><span data-out="total"></span> TON</strong></div>
        </div>
      </div>
    </form>
  );
};

