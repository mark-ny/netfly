import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ArrowRight, Download, ShieldCheck } from "lucide-react";
import { useApp } from "./state";
import { callWorker, db, gateway } from "./api";
import { demoMode } from "./catalog";
export function download(name: string, value: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
const message = (e: unknown) =>
  (e as Error).message || "The request could not be completed.";
export function Auth() {
  const loc = useLocation(),
    nav = useNavigate(),
    [params] = useSearchParams(),
    { session } = useApp(),
    kind = loc.pathname,
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  const reset = kind === "/account/reset",
    signup = kind === "/signup",
    recover = kind === "/recover",
    title = reset
      ? "Set a new password"
      : signup
        ? "Create an account"
        : recover
          ? "Reset your password"
          : "Welcome back";
  useEffect(() => setMsg(""), [kind]);
  const next = params.get("next") || "/profile",
    dest = /^\/(?!\/)[a-z0-9/-]*(\?[^\\]*)?$/i.test(next) ? next : "/profile";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return;
    setBusy(true);
    setMsg("");
    const f = new FormData(e.currentTarget),
      email = String(f.get("email") || ""),
      password = String(f.get("password") || "");
    try {
      if (reset) {
        if (!session)
          throw Error("Open the recovery link from your email first.");
        const r = await db.auth.updateUser({ password });
        if (r.error) throw r.error;
        nav("/profile");
      } else if (recover) {
        const r = await db.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + "/account/reset",
        });
        if (r.error) throw r.error;
        setMsg(
          "If this address has an account, a recovery link will arrive by email.",
        );
      } else if (signup) {
        const r = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin + "/profile" },
        });
        if (r.error) throw r.error;
        if (r.data.session) nav(dest);
        else
          setMsg("Check your email to verify your address before signing in.");
      } else {
        const r = await db.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        nav(dest);
      }
    } catch (e) {
      setMsg(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="formpage">
      <h1>{title}</h1>
      {demoMode ? (
        <>
          <p>
            This preview keeps your watchlist and viewing preferences in this
            browser. Cloud accounts are available when Supabase is connected.
          </p>
          <Link className="primary mt-5" to="/profile">
            Open local profile <ArrowRight size={16} />
          </Link>
        </>
      ) : (
        <>
          <form onSubmit={submit}>
            {!reset && (
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {!recover && (
              <label>
                {reset ? "New password" : "Password"}
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    signup || reset ? "new-password" : "current-password"
                  }
                  minLength={signup || reset ? 10 : 1}
                  required
                />
              </label>
            )}
            <button className="primary" disabled={busy || (reset && !session)}>
              {busy
                ? "Please wait…"
                : reset
                  ? "Save password"
                  : recover
                    ? "Send reset link"
                    : signup
                      ? "Create account"
                      : "Sign in"}
            </button>
          </form>
          {import.meta.env.VITE_GOOGLE_SIGN_IN === "true" &&
            !recover &&
            !reset && (
              <button
                className="ghost"
                onClick={async () => {
                  const r = await db!.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: location.origin + dest },
                  });
                  if (r.error) setMsg(r.error.message);
                }}
              >
                Continue with Google
              </button>
            )}
          <div className="subnav">
            {!signup && <Link to="/signup">Create account</Link>}
            {kind !== "/login" && <Link to="/login">Sign in</Link>}
            {!recover && !reset && <Link to="/recover">Forgot password?</Link>}
          </div>
        </>
      )}
      {msg && (
        <p className="msg" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
export function Mfa() {
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [msg, setMsg] = useState(""),
    [ready, setReady] = useState(false);
  async function start() {
    try {
      const { data, error } = await db!.auth.mfa.listFactors();
      if (error) throw error;
      const known = data.totp.find((x) => x.status === "verified");
      if (known) {
        setFactor(known.id);
        return;
      }
      const r = await db!.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Netfly " + Date.now(),
      });
      if (r.error) throw r.error;
      setFactor(r.data.id);
      setQr(r.data.totp.qr_code);
    } catch (e) {
      setMsg(message(e));
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    const r = await db!.auth.mfa.challengeAndVerify({ factorId: factor, code });
    if (r.error) setMsg(r.error.message);
    else {
      setReady(true);
      setMsg("Two-factor verification complete.");
      setQr("");
    }
  }
  return (
    <section>
      <h2>Two-factor verification</h2>
      {!factor ? (
        <button className="ghost" onClick={start}>
          <ShieldCheck size={16} />
          Set up or verify authenticator
        </button>
      ) : (
        !ready && (
          <form onSubmit={verify}>
            {qr && (
              <>
                <p>Scan this code in your authenticator.</p>
                <img
                  src={qr}
                  width="175"
                  height="175"
                  alt="Authenticator enrollment QR code"
                />
              </>
            )}
            <label>
              Six-digit code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button className="primary">Verify code</button>
          </form>
        )
      )}
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
export function Profile() {
  const { session, role, personal, preferences, setNotice } = useApp(),
    [name, setName] = useState(personal.name),
    [reduce, setReduce] = useState(personal.reduceData),
    [confirmText, setConfirm] = useState(""),
    [deleting, setDeleting] = useState(false),
    nav = useNavigate(),
    settings = useLocation().pathname === "/account/settings";
  useEffect(() => {
    setName(personal.name);
    setReduce(personal.reduceData);
  }, [personal.name, personal.reduceData]);
  if (!demoMode && !session)
    return (
      <div className="formpage">
        <h1>Your profile</h1>
        <Link className="primary" to="/login">
          Sign in
        </Link>
      </div>
    );
  async function remove(e: FormEvent) {
    e.preventDefault();
    try {
      if (confirmText !== "DELETE") throw Error("Enter DELETE to confirm.");
      if (demoMode) {
        localStorage.removeItem("stillframe:demo:v1");
        location.assign("/");
        return;
      }
      await callWorker("/account/delete", { confirmation: confirmText });
      await db!.auth.signOut({ scope: "local" });
      nav("/");
    } catch (err) {
      setNotice(message(err));
    }
  }
  async function exportData() {
    try {
      download(
        "netfly-data.json",
        demoMode ? personal : await callWorker("/account/export"),
      );
    } catch (e) {
      setNotice(message(e));
    }
  }
  return (
    <div className="formpage">
      <h1>{settings ? "Account settings" : personal.name || "Your profile"}</h1>
      <p>
        {demoMode
          ? "Local profile · Saved on this device"
          : session?.user.email}
      </p>
      <div className="subnav">
        <Link to="/watchlist">My List</Link>
        <Link to="/history">Watch history</Link>
        <Link to="/account/settings">Settings</Link>
        {role !== "viewer" && <Link to="/admin">Administration</Link>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void preferences(name.trim(), reduce);
        }}
      >
        <label>
          Display name
          <input
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={reduce}
            onChange={(e) => setReduce(e.target.checked)}
          />
          Load video only when I press play
        </label>
        <button className="primary">Save preferences</button>
      </form>
      {!demoMode && <Mfa />}
      <section>
        <h2>Your data</h2>
        <div className="actions">
          <button className="ghost" onClick={exportData}>
            <Download size={15} />
            Export data
          </button>
          <button className="ghost" onClick={() => setDeleting(!deleting)}>
            {demoMode ? "Clear local profile" : "Delete account"}
          </button>
        </div>
        {deleting && (
          <form onSubmit={remove}>
            <label>
              Type DELETE to permanently remove your{" "}
              {demoMode ? "local profile" : "account and personal viewing data"}
              .
              <input
                value={confirmText}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button disabled={confirmText !== "DELETE"} className="primary">
              Confirm deletion
            </button>
          </form>
        )}
      </section>
      {!demoMode && (
        <div className="actions">
          <button
            className="ghost"
            onClick={async () => {
              const r = await db!.auth.signOut();
              if (r.error) setNotice(r.error.message);
              else nav("/");
            }}
          >
            Sign out
          </button>
          <button
            className="ghost"
            onClick={async () => {
              const r = await db!.auth.signOut({ scope: "global" });
              if (r.error) setNotice(r.error.message);
              else nav("/");
            }}
          >
            Sign out on all devices
          </button>
        </div>
      )}
    </div>
  );
}
export function Support() {
  const [params] = useSearchParams(),
    [msg, setMsg] = useState(""),
    [pending, setPending] = useState(false),
    { session } = useApp(),
    [kind, setKind] = useState(
      params.get("kind") || (params.get("movie") ? "playback" : "support"),
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f),
      report = {
        kind,
        message: String(d.get("message")).trim(),
        movie_id: params.get("movie") || null,
        email: String(d.get("email") || ""),
      };
    setPending(true);
    setMsg("");
    try {
      if (demoMode) {
        download("netfly-report.json", report);
        setMsg(
          "Report saved to your device. Share it with the operator of this preview.",
        );
      } else {
        if (session) {
          const r = await db!
            .from("user_reports")
            .insert({
              kind: report.kind,
              message: report.message,
              movie_id: report.movie_id,
              user_id: session.user.id,
              contact_email: report.email || null,
            });
          if (r.error) throw r.error;
        } else {
          const r = await fetch(gateway + "/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(report),
          });
          if (!r.ok)
            throw Error("Unable to send this report. Please try again later.");
        }
        setMsg("Your report was submitted for review.");
        f.reset();
      }
    } catch (err) {
      setMsg(message(err));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="formpage">
      <h1>Support</h1>
      <p>
        {demoMode
          ? "Prepare a report to share with the preview operator."
          : "Send a playback issue, privacy request or copyright notice to the site operator."}
      </p>
      <form onSubmit={submit}>
        <label>
          Request type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="support">General support</option>
            <option value="playback">Playback issue</option>
            <option value="privacy">Privacy request</option>
            <option value="copyright">Copyright and takedown</option>
          </select>
        </label>
        <label>
          Reply email
          <input
            type="email"
            name="email"
            defaultValue={session?.user.email || ""}
            required={kind === "copyright"}
          />
        </label>
        <label>
          Details
          <textarea
            minLength={5}
            maxLength={3000}
            rows={6}
            required
            name="message"
            placeholder={
              kind === "copyright"
                ? "Identify the work, affected URL, your authority and the action requested."
                : "Describe your request"
            }
          />
        </label>
        <button className="primary" disabled={pending}>
          {demoMode
            ? "Download report"
            : pending
              ? "Sending…"
              : "Submit report"}
        </button>
      </form>
      {msg && (
        <p className="msg" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
export function Legal({ kind }: { kind: string }) {
  const { brand } = useApp();
  const text: Record<string, [string, string][]> = {
    privacy: [
      [
        "Information we use",
        "Cloud accounts store your email, profile preferences, watchlist, viewing position, ratings and support requests. The demo saves your profile in this browser. Playback uses your connection country to enforce territorial rights.",
      ],
      [
        "Purpose and retention",
        "Accounts and viewing records provide the requested streaming service. Short-lived playback records protect access and measure service performance. Raw playback sessions are retained for 30 days, viewing progress for 180 days and resolved reports for 180 days.",
      ],
      [
        "Your choices",
        "Use account settings to export or delete your data, or clear watch history separately. Contact the operator for access, correction, objection, restriction and complaints. Kenyan users may also contact the Office of the Data Protection Commissioner.",
      ],
      [
        "Service providers",
        "Configured cloud services include Cloudflare for media delivery and Supabase for accounts and storage of application records. Before public launch the operator must identify its controller contact, lawful bases, processors, transfers and safeguards.",
      ],
    ],
    terms: [
      [
        "Viewing",
        "Viewing is free at launch. Content availability depends on publication schedules and licensing territories. Access is for personal viewing under the applicable content license.",
      ],
      [
        "Accounts",
        "Protect account credentials and respect classification information. Do not redistribute films, interfere with playback services or submit content you lack authority to provide.",
      ],
      [
        "Availability",
        "An operator may withdraw access when rights expire or a rights dispute arises. Contact support about account access, content or accessibility.",
      ],
    ],
    copyright: [
      [
        "Rights holders",
        "Films can be withdrawn while a rights claim is reviewed. Include the work, affected film URL, your contact details, the nature of your rights and a good-faith explanation in your report.",
      ],
      [
        "Review process",
        "The operator records the report, verifies the claim, can suspend publication, contacts the rights holder and records the resolution.",
      ],
      [
        "Demo photography",
        "The eight original short picture studies use licensed Pexels photographs and original sound. Credits identify the photographers and source images.",
      ],
    ],
  };
  return (
    <div className="legal">
      <h1>
        {kind === "copyright"
          ? "Copyright & takedown"
          : kind === "terms"
            ? "Terms of viewing"
            : "Privacy notice"}
      </h1>
      <p className="small">
        {brand} · Operator template for professional review before public launch
      </p>
      {text[kind].map(([h, p]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{p}</p>
        </section>
      ))}
      <p>
        <Link
          to={
            "/support?kind=" +
            (kind === "privacy"
              ? "privacy"
              : kind === "copyright"
                ? "copyright"
                : "support")
          }
        >
          Contact the operator{" "}
          <ArrowRight size={14} style={{ display: "inline" }} />
        </Link>
      </p>
    </div>
  );
}
