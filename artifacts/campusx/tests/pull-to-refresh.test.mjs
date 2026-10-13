import assert from "node:assert/strict";
import test from "node:test";
import { bindPullToRefresh } from "../src/lib/pull-to-refresh-gesture.ts";

class TestElement extends EventTarget {
  scrollTop = 0;
  parentElement = null;
  interactive = false;
  closest() { return this.interactive ? this : this.parentElement?.closest() ?? null; }
}

function setup(t) {
  const previousWindow = globalThis.window;
  const previousElement = globalThis.Element;
  const window = new EventTarget();
  window.scrollY = 0;
  globalThis.window = window;
  globalThis.Element = TestElement;
  const root = new TestElement();
  const nested = new TestElement();
  nested.parentElement = root;
  let distance = 0;
  let refreshes = 0;
  let refreshing = false;
  const unbind = bindPullToRefresh(root, {
    isRefreshing: () => refreshing,
    setDistance: (value) => { distance = value; },
    refresh: () => { refreshes++; },
  });
  t.after(() => {
    unbind();
    globalThis.window = previousWindow;
    globalThis.Element = previousElement;
  });
  function emit(type, y = 0, { x = 0, target = nested, count = 1, cancelable = true } = {}) {
    const event = new Event(type, { cancelable });
    Object.defineProperties(event, {
      target: { value: target },
      touches: { value: Array.from({ length: count }, () => ({ clientX: x, clientY: y })) },
    });
    root.dispatchEvent(event);
    return event;
  }
  return {
    root, nested, window, emit, unbind,
    get distance() { return distance; },
    get refreshes() { return refreshes; },
    set refreshing(value) { refreshing = value; },
  };
}

test("an intentional 80px pull at the exact top refreshes only on release, once", (t) => {
  const h = setup(t);
  h.emit("touchstart", 100);
  const move = h.emit("touchmove", 180);
  assert.equal(move.defaultPrevented, true);
  assert.equal(h.distance, 80);
  assert.equal(h.refreshes, 0);
  h.emit("touchend");
  h.emit("touchend");
  assert.equal(h.distance, 0);
  assert.equal(h.refreshes, 1);
});

test("a tap and sub-20px movement never show the indicator or block scrolling", (t) => {
  const h = setup(t);
  h.emit("touchstart", 100);
  assert.equal(h.emit("touchmove", 119).defaultPrevented, false);
  assert.equal(h.distance, 0);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});

test("79px is below the refresh threshold", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 79);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
  assert.equal(h.distance, 0);
});

test("pulling back below the threshold before release does not refresh", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.emit("touchmove", 70);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});

for (const offset of [0.1, 1, 2, 300]) {
  test(`a window scrolled down ${offset}px never begins a pull`, (t) => {
    const h = setup(t);
    h.window.scrollY = offset;
    h.emit("touchstart");
    assert.equal(h.emit("touchmove", 100).defaultPrevented, false);
    assert.equal(h.distance, 0);
    h.emit("touchend");
    assert.equal(h.refreshes, 0);
  });
}

test("scrolling up to the top during an existing gesture does not arm refresh", (t) => {
  const h = setup(t);
  h.window.scrollY = 30;
  h.emit("touchstart");
  h.window.scrollY = 0;
  h.emit("touchmove", 100);
  h.emit("touchend");
  assert.equal(h.distance, 0);
  assert.equal(h.refreshes, 0);
});

for (const container of ["root", "nested"]) {
  test(`a ${container} container with a fractional scroll offset blocks pull`, (t) => {
    const h = setup(t);
    h[container].scrollTop = 0.1;
    h.emit("touchstart");
    assert.equal(h.emit("touchmove", 100).defaultPrevented, false);
    h.emit("touchend");
    assert.equal(h.refreshes, 0);
    assert.equal(h.distance, 0);
  });
}

test("any observed scroll off the top cancels and cannot re-arm the same gesture", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.nested.scrollTop = 1;
  h.window.dispatchEvent(new Event("scroll"));
  assert.equal(h.distance, 0);
  h.nested.scrollTop = 0;
  h.emit("touchmove", 120);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});

test("release rechecks the scroll position even without a scroll/move event", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.window.scrollY = 1;
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});

test("interactive controls and their descendants cannot start pull", (t) => {
  const h = setup(t);
  h.root.interactive = true;
  h.emit("touchstart");
  assert.equal(h.emit("touchmove", 100).defaultPrevented, false);
  assert.equal(h.distance, 0);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});

test("horizontal/upward gestures, cancellation and multitouch never refresh", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 10, { x: 40 });
  h.emit("touchmove", 100);
  h.emit("touchend");
  h.emit("touchstart", 100);
  h.emit("touchmove", 90);
  h.emit("touchmove", 200);
  h.emit("touchend");
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.emit("touchcancel");
  h.emit("touchend");
  h.emit("touchstart");
  h.emit("touchmove", 100, { count: 2 });
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
  assert.equal(h.distance, 0);
});

test("native scrolling that is no longer cancelable cannot be hijacked", (t) => {
  const h = setup(t);
  h.emit("touchstart");
  h.emit("touchmove", 100, { cancelable: false });
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
  assert.equal(h.distance, 0);
});

test("wheel/trackpad scrolling remains native and never refreshes", (t) => {
  const h = setup(t);
  assert.equal(h.emit("wheel").defaultPrevented, false);
  assert.equal(h.distance, 0);
  assert.equal(h.refreshes, 0);
});

test("active refreshes block new gestures; cleanup removes handlers", (t) => {
  const h = setup(t);
  h.refreshing = true;
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.emit("touchend");
  h.refreshing = false;
  h.unbind();
  h.emit("touchstart");
  h.emit("touchmove", 100);
  h.emit("touchend");
  assert.equal(h.refreshes, 0);
});
