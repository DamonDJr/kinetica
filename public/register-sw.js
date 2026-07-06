if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Ask the browser to check for a new sw.js right away, so a stale
        // worker controlling this page gets replaced on the next visit.
        reg.update().catch(() => {});
      })
      .catch(() => {});

    // When a new worker takes control (after skipWaiting + claim), reload once
    // so the page swaps the stale cached shell for the fresh one automatically.
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
