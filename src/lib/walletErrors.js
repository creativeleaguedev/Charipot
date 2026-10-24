// Maps a failed wallet / marketplace operation to a plain, actionable toast.
// Backend functions return structured errors (insufficient, insufficient_gas,
// blacklisted) on 2xx responses, but non-2xx responses throw and the raw
// "Request failed with status code XXX" leaks to the UI. Recover the server
// body and translate the known cases instead.
export function friendlyWalletError(e, fallbackTitle = "Action failed") {
  const raw = e?.response?.data || e?.data || e?.body || (typeof e?.json === "function" ? null : e);
  const code = raw?.error || e?.error;
  const msg = raw?.message || e?.message || "";

  if (code === "insufficient" || (/insufficient/i.test(msg) && !/gas/i.test(msg))) {
    return {
      title: "Insufficient funds",
      description:
        "Your wallet doesn't have enough of this token to complete the transaction. Deposit the token and try again.",
    };
  }
  if (code === "insufficient_gas" || /gas|intrinsic|underpriced|fee/i.test(msg)) {
    return {
      title: "Insufficient gas fee",
      description:
        "Your wallet needs a small amount of native token (BNB, ETH or MATIC) to pay the network fee. Deposit gas and retry.",
    };
  }
  if (code === "blacklisted" || raw?.status === 403 || e?.status === 403) {
    return { title: "Account restricted" };
  }
  if (code === "Unauthorized" || /unauthorized/i.test(msg)) {
    return { title: fallbackTitle, description: "Please sign in again and retry." };
  }
  if (msg && !/status code/i.test(msg)) return { title: fallbackTitle, description: msg };
  return {
    title: fallbackTitle,
    description: "Something went wrong. Please check your wallet and try again.",
  };
}