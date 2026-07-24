import { useEffect, useState } from "react";

// How many pixels of the layout viewport are hidden below the *visual*
// viewport's bottom edge — i.e. covered by the mobile browser's bottom bar
// (Safari) or the on-screen keyboard. A fixed bottom bar shifts up by this so
// it stays visible above the chrome. Returns 0 where visualViewport is
// unavailable or nothing is covering the bottom (e.g. desktop).
export function useBottomInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setInset(
          Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        );
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
