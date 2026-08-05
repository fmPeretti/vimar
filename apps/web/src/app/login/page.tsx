import { isLoginLocked } from "@vimar/db";
import { LoginScreen } from "./LoginScreen";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const params = await searchParams;
  const configured = Boolean(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);
  const locked = configured && (await isLoginLocked());

  return <LoginScreen from={params.from ?? null} initiallyLocked={locked} />;
}
