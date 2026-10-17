import { useEffect, useState } from "react";
import {
  Heart,
  Plus,
  Check,
  LoaderCircle,
  UserRound,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { User } from "../../shared/model";
import { api } from "./api";
export function PeoplePage({
  me,
  onMeChange,
  onSignOut,
}: {
  onSignOut: () => void;
  me: User;
  onMeChange: (user: User) => void;
}) {
  const [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [create, setCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "" });
  const refresh = () => api("users").then((data) => setUsers(data.items));
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function update(user: User, changes: Record<string, unknown>) {
    setError("");
    setNotice("");
    try {
      const saved = await api(`users/${user.id}`, "PATCH", changes);
      await refresh();
      if (saved.id === me.id) onMeChange(saved);
      setNotice(
        changes.password
          ? "Password changed. That account must sign in again."
          : "Account updated",
      );
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  return (
    <>
      <section className="card account-session">
        <div>
          <strong>Signed in as {me.name}</strong>
          <p>@{me.username} · This device</p>
        </div>
        <button type="button" className="secondary" onClick={onSignOut}>
          <LogOut size={16} />
          Sign out
        </button>
      </section>
      <div className="together-note">
        <Heart size={20} />
        <div>
          <strong>A space for both of you.</strong>
          <p>
            Every active account can change the clock, share messages, edit your story and
            manage accounts. There are no lesser permissions for either of you.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error account-alert">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="saved-note">
          <Check size={15} />
          {notice}
        </p>
      )}
      <div className="people-grid">
        {users.map((user) => (
          <UserCard key={user.id} user={user} me={me} update={update} />
        ))}
        <section className="card add-person-card">
          {!create ? (
            <>
              <div className="mini-icon">
                <Plus size={22} />
              </div>
              <h2>
                {users.length < 2 ? "Bring your person home." : "Another familiar face?"}
              </h2>
              <p>
                {users.length < 2
                  ? "Give her a username and password of her own. This little space belongs to both of you."
                  : "Create another account with the same shared controls."}
              </p>
              <button className="primary rose" onClick={() => setCreate(true)}>
                <Plus size={16} />
                Create account
              </button>
            </>
          ) : (
            <form
              className="form-card"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api("users", "POST", newUser);
                  setNewUser({ username: "", name: "", password: "" });
                  setCreate(false);
                  await refresh();
                  setNotice("Account created. You can now sign in separately.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2>A place for your person</h2>
              <label htmlFor="new-name">Display name</label>
              <input
                id="new-name"
                required
                maxLength={60}
                value={newUser.name}
                autoComplete="off"
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                required
                pattern="[A-Za-z0-9_-]{3,32}"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={32}
                value={newUser.username}
                autoComplete="off"
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <label htmlFor="new-password">Password · at least 16 characters</label>
              <input
                id="new-password"
                required
                minLength={16}
                maxLength={256}
                type="password"
                autoComplete="new-password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <button className="primary rose" disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
                Create account
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setCreate(false)}
              >
                Cancel
              </button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
function UserCard({
  user,
  me,
  update,
}: {
  user: User;
  me: User;
  update: (user: User, changes: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(user.name),
    [username, setUsername] = useState(user.username),
    [password, setPassword] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false);
  const mine = user.id === me.id;
  return (
    <section className={"card person-card " + (!user.enabled ? "disabled-person" : "")}>
      <div className="person-heading">
        <span className="person-avatar">{user.name.slice(0, 1)}</span>
        <div>
          <h2>
            {user.name}
            {mine && <small>You</small>}
          </h2>
          <p>
            @{user.username} · {user.enabled ? "Active" : "Disabled"}
          </p>
        </div>
        <ShieldCheck size={20} />
      </div>
      <form
        className="form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await update(user, { name, username });
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={`name-${user.id}`}>Display name</label>
        <input
          id={`name-${user.id}`}
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor={`username-${user.id}`}>Username</label>
        <input
          id={`username-${user.id}`}
          required
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={32}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button className="primary" disabled={busy}>
          <Check size={15} />
          Save profile
        </button>
      </form>
      <button className="text-button" onClick={() => setReset(!reset)}>
        {mine ? "Change my password" : "Reset password"}
      </button>
      {reset && (
        <form
          className="form-card password-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await update(user, { password, ...(mine ? { currentPassword } : {}) });
              setPassword("");
              setCurrentPassword("");
              setReset(false);
              if (mine) window.dispatchEvent(new Event("mb-auth-expired"));
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          {mine && (
            <>
              <label htmlFor={`current-${user.id}`}>Current password</label>
              <input
                id={`current-${user.id}`}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </>
          )}
          <label htmlFor={`password-${user.id}`}>
            New password · at least 16 characters
          </label>
          <input
            id={`password-${user.id}`}
            type="password"
            autoComplete="new-password"
            required
            minLength={16}
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="input-note">
            Changing a password signs this account out on every device.
          </p>
          <button className="primary" disabled={busy}>
            Change password
          </button>
        </form>
      )}
      {!mine && (
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await update(user, { enabled: !user.enabled });
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          {user.enabled ? "Disable account" : "Enable account"}
        </button>
      )}
      <p className="quiet-note">
        <UserRound size={14} />
        {mine
          ? "You stay signed in for up to 30 days."
          : "Disabling an account signs it out immediately. Its messages and activity stay in your story."}
      </p>
    </section>
  );
}
