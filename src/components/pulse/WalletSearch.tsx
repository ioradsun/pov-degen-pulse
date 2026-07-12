import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WALLET_RE } from "@/lib/pov/wallet";

/** Header lookup: paste a wallet, jump to its lifetime P&L breakdown. */
export function WalletSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [err, setErr] = useState(false);

  const go = () => {
    const addr = value.trim();
    if (!WALLET_RE.test(addr)) {
      setErr(true);
      return;
    }
    setErr(false);
    navigate({ to: "/wallet/$address", params: { address: addr.toLowerCase() } });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (err) setErr(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Look up a wallet — 0x…"
          spellCheck={false}
          aria-label="Wallet address"
          className="h-9 flex-1 rounded-sm border border-[var(--line)] bg-[var(--surface)] px-3 font-mono text-[13px] tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--ink-dim)]"
          style={err ? { borderColor: "var(--down)" } : undefined}
        />
        <button
          type="button"
          onClick={go}
          className="h-9 rounded-sm border border-[var(--line)] bg-[var(--surface)] px-4 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--line-dim)]/40"
        >
          Look up
        </button>
      </div>
      {err && (
        <span className="text-[11px] text-[var(--down)]">
          Enter a valid 0x wallet address (42 characters).
        </span>
      )}
    </div>
  );
}
