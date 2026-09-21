import App from "@/components/App";
import { identity } from "@/server/auth";
import { dashboard, getBank, getUserState, studyBank } from "@/server/service";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await identity();
  if (!user) return <App />;
  const bank = await getBank(user);
  const state = await getUserState(user);
  return <App initialData={dashboard(user, studyBank(bank, state), state)} />;
}
