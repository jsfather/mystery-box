import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, RefreshCcw, Heart, X } from "lucide-react";
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let pendingPrompt: InstallPrompt | null = null;
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() => pendingPrompt),
    [help, setHelp] = useState(false),
    [installed, setInstalled] = useState(
      () =>
        window.matchMedia("(display-mode: standalone)").matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone,
    ),
    [update, setUpdate] = useState<ServiceWorkerRegistration | null>(null);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const install = (e: Event) => {
      e.preventDefault();
      pendingPrompt = e as InstallPrompt;
      setPrompt(pendingPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const ready = (e: Event) =>
      setUpdate((e as CustomEvent<ServiceWorkerRegistration>).detail);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("appinstalled", done);
    window.addEventListener("mb-update-ready", ready);
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => {
        if (reg?.waiting) setUpdate(reg);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("appinstalled", done);
      window.removeEventListener("mb-update-ready", ready);
    };
  }, []);
  return (
    <>
      {update && (
        <div className="install-banner">
          <RefreshCcw size={20} />
          <div>
            <strong>A little refresh is ready.</strong>
            <p>Save any open forms before updating your app.</p>
          </div>
          <button
            className="secondary"
            onClick={() => update.waiting?.postMessage({ type: "SKIP_WAITING" })}
          >
            Update app
          </button>
        </div>
      )}
      {!installed && (
        <div className="install-banner">
          <Heart size={22} />
          <div>
            <strong>A little place on your Home Screen.</strong>
            <p>Keep our world one tap away.</p>
          </div>
          <button
            className="secondary"
            onClick={async () => {
              if (prompt) {
                await prompt.prompt();
                const result = await prompt.userChoice;
                if (result.outcome === "accepted") {
                  pendingPrompt = null;
                  setPrompt(null);
                }
              } else setHelp(!help);
            }}
          >
            <Download size={15} />
            Install app
          </button>
        </div>
      )}
      {help && !installed && (
        <section className="card install-help">
          <button
            className="icon-button"
            aria-label="Close installation instructions"
            onClick={() => setHelp(false)}
          >
            <X size={17} />
          </button>
          <h2>
            {ios
              ? "Make a little home on your iPhone."
              : "Take our little world with you."}
          </h2>
          <p>
            {ios
              ? "Open this HTTPS site in Safari, then:"
              : "On iPhone, open this HTTPS site in Safari. On Android or desktop, use your browser’s Install app option when available."}
          </p>
          <ol>
            <li>
              <Share size={16} />
              Open Safari’s menu and tap <strong>Share</strong>.
            </li>
            <li>
              <PlusSquare size={16} />
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              <Heart size={16} />
              Keep <strong>Open as Web App</strong> enabled if shown, then tap{" "}
              <strong>Add</strong>.
            </li>
          </ol>
          <p>
            Your accounts work in the installed app too. Sign in again there if Safari
            doesn’t share its session.
          </p>
        </section>
      )}
    </>
  );
}
export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
  });
  let controlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled && !reloading) {
      reloading = true;
      window.location.reload();
    }
    controlled = true;
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        const notify = () =>
          window.dispatchEvent(new CustomEvent("mb-update-ready", { detail: reg }));
        if (reg.waiting) notify();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller)
              notify();
          });
        });
      })
      .catch(() => {
        /* The online application remains usable without offline caching. */
      });
  });
}
