import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearSqlUser, isLocalDemoSession, LOCAL_DEMO_ROLES, setSqlUser, startLocalDemoSession } from "@/lib/local-demo-auth";
import { sqlApiRequest } from "@/lib/sql-api";

export const Route = createFileRoute("/auth")({
    head: () => ({
        meta: [
            { title: "Sign in — Growel Promotional" },
            { name: "description", content: "Sign in securely to the Growel Promotional operations workspace." },
            { property: "og:title", content: "Sign in — Growel Promotional" },
            { property: "og:description", content: "Secure access to Growel Promotional inventory and requests." },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
    component: AuthPage,
});
function AuthPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [signupMode, setSignupMode] = useState(false);
    const [signupMessage, setSignupMessage] = useState("");
    const [signupRequestedRole, setSignupRequestedRole] = useState("executive");
    useEffect(() => {
        if (isLocalDemoSession())
            return;
        let active = true;
        void sqlApiRequest("/api/auth/session").then(({ user }) => {
            if (!active || !user) return;
            setSqlUser(user);
            void navigate({ to: "/" });
        }).catch((error) => {
            if (error.status !== 401) console.error("Could not check the SQL sign-in session.", error);
            clearSqlUser();
        });
        return () => { active = false; };
    }, [navigate]);
    async function handleSubmit(event) {
        event.preventDefault();
        setSubmitting(true);
        setErrorMessage("");
        try {
            const { user } = await sqlApiRequest("/api/auth/login", {
                method: "POST",
                body: JSON.stringify({ email: email.trim(), password }),
            });
            setSqlUser(user);
            await navigate({ to: "/" });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Sign-in could not be completed.");
            setSubmitting(false);
        }
    }
    async function handleSignup(event) {
        event.preventDefault();
        setSubmitting(true);
        setErrorMessage("");
        setSignupMessage("");
        const form = event.currentTarget;
        const formData = new FormData(form);
        try {
            const result = await sqlApiRequest("/api/auth/signup", {
                method: "POST",
                body: JSON.stringify({
                    displayName: formData.get("displayName"),
                    email: formData.get("signupEmail"),
                    password: formData.get("signupPassword"),
                    requestedRole: formData.get("requestedRole"),
                    region: formData.get("region"),
                    approvalAuthorityRole: formData.get("approvalAuthorityRole"),
                }),
            });
            setSignupMessage(result.message);
            form.reset();
            setSignupRequestedRole("executive");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Sign-up could not be completed.");
        }
        finally {
            setSubmitting(false);
        }
    }
    async function handleLocalDemoSignIn(role) {
        setErrorMessage("");
        try {
            startLocalDemoSession(role);
            await navigate({ to: "/" });
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Local admin test mode could not be started.");
        }
    }
    return (<main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-[420px]" aria-labelledby="login-title">
        <div className="mb-9 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-lg bg-primary text-xl font-extrabold text-primary-foreground shadow-sm">G</div>
          <h1 id="login-title" className="mt-4 text-2xl font-extrabold text-foreground">Growel</h1>
          <p className="mt-1 text-xs font-bold uppercase text-primary">Promotional</p>
          <p className="mt-5 text-sm text-muted-foreground">Sign in to continue to your workspace</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-5 grid grid-cols-2 rounded-md bg-muted p-1">
            <button type="button" onClick={() => { setSignupMode(false); setErrorMessage(""); setSignupMessage(""); }} className={`h-9 rounded text-sm font-bold ${!signupMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Sign in</button>
            <button type="button" onClick={() => { setSignupMode(true); setErrorMessage(""); setSignupMessage(""); }} className={`h-9 rounded text-sm font-bold ${signupMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Sign up</button>
          </div>
          {signupMode ? (
            <form className="space-y-5" onSubmit={handleSignup}>
              <p className="text-sm text-muted-foreground">Sign up with your Growel Feeds email. An Admin reviews your requested role and profile details before access is granted.</p>
              <div className="space-y-2">
                <label htmlFor="signup-name" className="text-sm font-bold text-foreground">Full name</label>
                <Input id="signup-name" name="displayName" autoComplete="name" required maxLength={120} className="h-11"/>
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-email" className="text-sm font-bold text-foreground">Work email</label>
                <Input id="signup-email" name="signupEmail" type="email" autoComplete="email" required maxLength={254} pattern="^[^@\s]+@growelfeeds\.com$" title="Use your @growelfeeds.com email address." placeholder="name@growelfeeds.com" className="h-11"/>
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-role" className="text-sm font-bold text-foreground">Requested role</label>
                <select id="signup-role" name="requestedRole" required value={signupRequestedRole} onChange={(event) => setSignupRequestedRole(event.target.value)} className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                  <option value="executive">Executive</option>
                  <option value="rm">RM · Regional Manager</option>
                  <option value="avp">AVP · Assistant Vice President</option>
                  <option value="gm">GM · General Manager</option>
                  <option value="hr">HR</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-region" className="text-sm font-bold text-foreground">Area / region</label>
                <Input id="signup-region" name="region" required maxLength={80} autoComplete="address-level1" className="h-11"/>
              </div>
              {signupRequestedRole !== "hr" && (
                <div className="space-y-2">
                  <label htmlFor="signup-authority" className="text-sm font-bold text-foreground">Approving authority</label>
                  <select id="signup-authority" name="approvalAuthorityRole" required defaultValue="rm" className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
                    <option value="rm">RM · Regional Manager</option>
                    <option value="avp">AVP · Assistant Vice President</option>
                    <option value="gm">GM · General Manager</option>
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="signup-password" className="text-sm font-bold text-foreground">Password</label>
                <Input id="signup-password" name="signupPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={200} className="h-11"/>
                <p className="text-xs text-muted-foreground">Use 12 to 200 characters.</p>
              </div>
              {errorMessage && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-sm font-semibold text-destructive">{errorMessage}</p>}
              {signupMessage && <p role="status" className="rounded-md bg-success-soft px-3 py-2.5 text-sm font-semibold text-success">{signupMessage}</p>}
              <Button type="submit" disabled={submitting} className="h-11 w-full font-bold">
                {submitting && <LoaderCircle className="animate-spin"/>} Submit sign-up
              </Button>
            </form>
          ) : (<>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-bold text-foreground">Email address</label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="h-11"/>
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-bold text-foreground">Password</label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="h-11 pr-11"/>
                <Button type="button" variant="ghost" size="icon" aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 size-9 text-muted-foreground">
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {errorMessage && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-sm font-semibold text-destructive">{errorMessage}</p>}
            <Button type="submit" disabled={submitting} className="h-11 w-full font-bold">
              {submitting && <LoaderCircle className="animate-spin"/>} Sign in
            </Button>
          </form>

            {import.meta.env.DEV && (<div className="mt-5 border-t border-border pt-5">
              <p className="text-center text-xs text-muted-foreground">Development demo · Sample data only · No passwords or real accounts</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {LOCAL_DEMO_ROLES.map((role) => (
                  <Button key={role} type="button" variant={role === "admin" ? "default" : "outline"} onClick={() => handleLocalDemoSignIn(role)} className="h-10 font-bold">
                    Demo as {role.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>)}
            </>)}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Authorized users only</p>
      </section>
    </main>);
}
