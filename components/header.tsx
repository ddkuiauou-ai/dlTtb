import { getSites } from "@/lib/queries";
import { HeaderClient } from "./header-client";

export async function Header() {
  const sites = await getSites();
  return <HeaderClient sites={sites} />;
}

