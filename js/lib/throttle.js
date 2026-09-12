// Leading + trailing throttle with cancel.
// - Leading: if `wait` has passed since the last run, the call runs now.
// - Trailing: a call inside the window is remembered and flushed by a timer
//   when the window ends — so the final keystroke of a burst is never lost.
export function throttle(fn, wait, nowFn = Date.now) {
  let lastRun = -Infinity;
  let timer = null;
  let pendingArgs = null;
  let pendingThis = null;

  function run(thisArg, args) {
    lastRun = nowFn();
    fn.apply(thisArg, args);
  }

  function throttled(...args) {
    const now = nowFn();
    if (now - lastRun >= wait) {
      run(this, args);
      return;
    }
    pendingArgs = args;
    pendingThis = this;
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        if (pendingArgs) run(pendingThis, pendingArgs);
        pendingArgs = null;
        pendingThis = null;
      }, wait - (now - lastRun));
    }
  }

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
    pendingThis = null;
  };

  return throttled;
}
