import { useEffect, useState } from "react";
import { getRpcHealth, subscribeRpcHealth } from "@/lib/pov/rpc";
import type { RpcHealthState } from "@/lib/pov/types";

export function useRpcHealth(): RpcHealthState {
  const [h, setH] = useState<RpcHealthState>(() => getRpcHealth());
  useEffect(() => subscribeRpcHealth(setH), []);
  return h;
}
