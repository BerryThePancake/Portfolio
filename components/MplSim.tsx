'use client';
import { useEffect, useRef } from "react";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.28.1/full/";

export default function MplSim() {
  const targetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pyodide: any = null;

    const isDark =
      typeof document !== "undefined" &&
      (document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark"));

    async function boot() {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = `${PYODIDE_URL}pyodide.js`;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load Pyodide"));
          document.head.appendChild(s);
        });
      }

      pyodide = await (window as any).loadPyodide({ indexURL: PYODIDE_URL });
      if (cancelled) return;
      await pyodide.loadPackage(["numpy", "matplotlib"]);

      (document as any).pyodideMplTarget = targetRef.current;
      (window as any).pyodideMplTarget = targetRef.current;
      if (targetRef.current) targetRef.current.innerHTML = "";

      const pyTheme = isDark ? "dark" : "light";

      // Determine initial figure size before running Python
      const dpi = 120;
      const rect0 = targetRef.current?.getBoundingClientRect();
      const side0 = rect0 ? Math.max(200, Math.floor(Math.min(rect0.width, rect0.height) - 4)) : 600;
      pyodide.globals.set("JS_W", side0);
      pyodide.globals.set("JS_H", side0);
      pyodide.globals.set("JS_DPI", dpi);

      let code = String.raw`
import sys, traceback
try:
    import matplotlib
    matplotlib.use('webagg')
    matplotlib.rcParams['toolbar'] = 'None'

    import numpy as np
    import matplotlib.pyplot as plt
    from matplotlib.widgets import Slider, Button
    from matplotlib.animation import FuncAnimation
    import time

    THEME = '__THEME__'

    num_traj = 35
    pts      = 800
    t_end    = 50.0
    tail_len = 50

    t  = np.linspace(0, t_end, pts)
    dt = t[1] - t[0]

    initial = np.random.uniform(-1, 1, (num_traj, 3))

    BASE_CAP_NORM  = 5e3
    BASE_HARD_CLIP = 1e4

    def deriv(Y, alpha, beta):
        x, y, z = Y[:, 0], Y[:, 1], Y[:, 2]
        dx = -alpha * x + y + 10 * y * z
        dy = -x - 0.4 * y + 5 * x * z
        dz =  beta * z - 5 * x * y
        return np.column_stack((dx, dy, dz))

    def integrate(alpha, beta, stable=False):
        substeps   = 6 if stable else 1
        CAP_NORM   = 2e3 if stable else BASE_CAP_NORM
        HARD_CLIP  = 5e3 if stable else BASE_HARD_CLIP

        local_dt = dt / substeps

        Y   = initial.copy().astype(np.float64)
        out = np.full((pts, num_traj, 3), np.nan, dtype=np.float64)
        out[0] = Y

        for i in range(1, pts):
            for _ in range(substeps):
                k1 = deriv(Y,                    alpha, beta)
                k2 = deriv(Y + 0.5 * local_dt * k1, alpha, beta)
                k3 = deriv(Y + 0.5 * local_dt * k2, alpha, beta)
                k4 = deriv(Y +        local_dt * k3, alpha, beta)
                Y  = Y + (local_dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
                np.clip(Y, -HARD_CLIP, HARD_CLIP, out=Y)
                if not np.isfinite(Y).all():
                    break
                norms = np.linalg.norm(Y, axis=1)
                big   = norms > CAP_NORM
                if np.any(big):
                    Y[big] *= (CAP_NORM / norms[big])[:, None]
            if not np.isfinite(Y).all():
                break
            out[i] = Y
        return out

    def theme_colors(theme):
        DARK = theme == 'dark'
        fg   = '#ffffff' if DARK else '#111111'
        bg   = '#0b0b0b' if DARK else '#ffffff'
        grid = '#666666' if DARK else '#cccccc'
        slider_bg = '#2f2f2f' if DARK else '#e5e5e5'
        return fg, bg, grid, slider_bg

    init_alpha, init_beta = 0.5, 0.5
    stable_mode = False
    data = integrate(init_alpha, init_beta, stable=stable_mode)

    # Use JS-provided size for initial figure
    try:
        JS_W, JS_H, JS_DPI
    except NameError:
        JS_W, JS_H, JS_DPI = 600, 600, 120
    fig = plt.figure(figsize=(JS_W/JS_DPI, JS_H/JS_DPI), dpi=JS_DPI)
    FIG = fig
    ax  = fig.add_subplot(projection='3d')

    fg, bg, grid, slider_bg = theme_colors(THEME)
    fig.patch.set_facecolor(bg)
    ax.set_facecolor(bg)
    ax.xaxis._axinfo['grid']['color'] = grid
    ax.yaxis._axinfo['grid']['color'] = grid
    ax.zaxis._axinfo['grid']['color'] = grid
    ax.tick_params(colors=fg)
    ax.set_xlabel('X', color=fg); ax.set_ylabel('Y', color=fg); ax.set_zlabel('Z', color=fg)

    def set_limits_from(d):
        d = d.reshape(-1, 3)
        finite = np.isfinite(d).all(axis=1)
        if not np.any(finite):
            ax.set_xlim(-2, 2); ax.set_ylim(-2, 2); ax.set_zlim(-2, 2)
            return
        d = d[finite]
        pad = 1.1
        x_min, x_max = np.min(d[:, 0]), np.max(d[:, 0])
        y_min, y_max = np.min(d[:, 1]), np.max(d[:, 1])
        z_min, z_max = np.min(d[:, 2]), np.max(d[:, 2])
        if x_min == x_max: x_min, x_max = x_min - 1, x_max + 1
        if y_min == y_max: y_min, y_max = y_min - 1, y_max + 1
        if z_min == z_max: z_min, z_max = z_min - 1, z_max + 1
        ax.set_xlim(x_min * pad, x_max * pad)
        ax.set_ylim(y_min * pad, y_max * pad)
        ax.set_zlim(z_min * pad, z_max * pad)

    set_limits_from(data)

    cmap = plt.cm.get_cmap('gist_rainbow')
    lines = [ax.plot([], [], [], lw=1.0, color=cmap(i / num_traj), antialiased=False)[0]
             for i in range(num_traj)]

    ax_alpha = plt.axes([0.16, 0.02, 0.34, 0.035], facecolor=slider_bg)
    ax_beta  = plt.axes([0.52, 0.02, 0.34, 0.035], facecolor=slider_bg)
    s_alpha  = Slider(ax_alpha, 'alpha', 0.0, 1.5, valinit=init_alpha, valfmt='%.3f')
    s_beta   = Slider(ax_beta,  'beta',  0.0, 1.5, valinit=init_beta,  valfmt='%.3f')
    if hasattr(s_alpha, 'label'):
        s_alpha.label.set_visible(False)
    if hasattr(s_beta, 'label'):
        s_beta.label.set_visible(False)

    txt_alpha = fig.text(0.16, 0.065, f'alpha = {init_alpha:.3f}', color=fg)
    txt_beta  = fig.text(0.52, 0.065, f'beta = {init_beta:.3f}', color=fg)

    ax_btn   = plt.axes([0.02, 0.02, 0.12, 0.04])
    btn      = Button(ax_btn, 'OFF', color=slider_bg, hovercolor=slider_bg)

    def init():
        for ln in lines:
            ln.set_data([], [])
            ln.set_3d_properties([])
        return lines

    def animate(i):
        i = max(1, i)
        start = max(0, i - tail_len)
        for idx, ln in enumerate(lines):
            seg = data[start:i, idx]
            finite = np.isfinite(seg).all(axis=1)
            if not np.any(finite):
                ln.set_data([], []); ln.set_3d_properties([])
                continue
            seg = seg[finite]
            ln.set_data(seg[:, 0], seg[:, 1])
            ln.set_3d_properties(seg[:, 2])
        ax.view_init(20, 0.2 * i)
        return lines

    ani = FuncAnimation(fig, animate, init_func=init, frames=pts, interval=20, blit=False, repeat=True)

    _last_request = 0.0
    DEBOUNCE_SEC  = 0.2

    def on_slider_change(_):
        global _last_request
        txt_alpha.set_text(f'alpha = {s_alpha.val:.3f}')
        txt_beta.set_text(f'beta = {s_beta.val:.3f}')
        _last_request = time.time()

    def poll_update():
        global _last_request, data, stable_mode
        if _last_request != 0 and (time.time() - _last_request) >= DEBOUNCE_SEC:
            _last_request = 0
            data = integrate(s_alpha.val, s_beta.val, stable=stable_mode)
            set_limits_from(data)
            fig.canvas.draw_idle()

    s_alpha.on_changed(on_slider_change)
    s_beta.on_changed(on_slider_change)

    timer = fig.canvas.new_timer(interval=50)
    timer.add_callback(poll_update)
    timer.start()

    def toggle_stability(event):
        global stable_mode, data
        stable_mode = not stable_mode
        btn.label.set_text('ON' if stable_mode else 'OFF')
        data = integrate(s_alpha.val, s_beta.val, stable=stable_mode)
        set_limits_from(data)
        fig.canvas.draw_idle()

    btn.on_clicked(toggle_stability)

    def set_fig_size_px(w, h, dpi=120):
        FIG.set_dpi(dpi)
        FIG.set_size_inches(w/dpi, h/dpi, forward=True)
        FIG.canvas.draw_idle()

    def apply_theme(theme):
        global fg, bg, grid, slider_bg
        fg, bg, grid, slider_bg = theme_colors(theme)
        fig.patch.set_facecolor(bg)
        ax.set_facecolor(bg)
        ax.xaxis._axinfo['grid']['color'] = grid
        ax.yaxis._axinfo['grid']['color'] = grid
        ax.zaxis._axinfo['grid']['color'] = grid
        ax.tick_params(colors=fg)
        for t in [ax.xaxis.label, ax.yaxis.label, ax.zaxis.label]:
            t.set_color(fg)
        for txt in [txt_alpha, txt_beta]:
            txt.set_color(fg)
        fig.canvas.draw_idle()

    fig.canvas.draw_idle()
    plt.show()

except Exception:
    import traceback
    from js import document
    el = document.createElement('pre')
    el.style.color = 'white'
    el.style.whiteSpace = 'pre-wrap'
    el.textContent = """Python error:\n\n""" + traceback.format_exc()
    tgt = getattr(document, 'pyodideMplTarget', None)
    (tgt or document.body).appendChild(el)
    raise
`;
      code = code.replace("__THEME__", pyTheme);

      await pyodide.runPythonAsync(code);

      const resize = () => {
        if (!targetRef.current || !pyodide) return;
        const rect = targetRef.current.getBoundingClientRect();
        const side = Math.max(200, Math.floor(Math.min(rect.width, rect.height) - 4));
        pyodide.globals.set("JS_W", side);
        pyodide.globals.set("JS_H", side);
        pyodide.globals.set("JS_DPI", dpi);
        pyodide.runPython("set_fig_size_px(JS_W, JS_H, JS_DPI)");
      };

      resize();
      const ro = new ResizeObserver(resize);
      if (targetRef.current) ro.observe(targetRef.current);
      window.addEventListener("resize", resize);

      const hideHeader = () => {
        const root = targetRef.current;
        if (!root) return;
        const nodes = root.querySelectorAll("div, h1, h2");
        nodes.forEach((el) => {
          const txt = (el.textContent || "").trim();
          if (/^Figure\\s+\\d+$/.test(txt)) {
            (el as HTMLElement).style.display = "none";
          }
        });
      };
      hideHeader();

      const mo = new MutationObserver(hideHeader);
      if (targetRef.current) mo.observe(targetRef.current, { childList: true, subtree: true });

      const themeObserver = new MutationObserver(() => {
        const nowDark =
          document.documentElement.classList.contains("dark") ||
          document.body.classList.contains("dark");
        pyodide.globals.set("JS_THEME", nowDark ? "dark" : "light");
        pyodide.runPython("apply_theme(JS_THEME)");
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });

      return () => {
        window.removeEventListener("resize", resize);
        ro.disconnect();
        mo.disconnect();
        themeObserver.disconnect();
      };
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full flex justify-center">
      <div className="w-full flex justify-center">
        <div className="rounded-2xl shadow-lg overflow-hidden bg-transparent" style={{ width: "min(95vw, 900px)" }}>
          <div
            ref={targetRef}
            id="mpl-target"
            className="w-full"
            style={{ aspectRatio: "1 / 1" }}
          />
        </div>
      </div>

      <style jsx global>{`
        #mpl-target .mpl-toolbar { display: none !important; }
        #mpl-target .mpl-default-header,
        #mpl-target .mpl-header,
        #mpl-target .mpl-message,
        #mpl-target h1,
        #mpl-target h2 { display: none !important; }
        #mpl-target, #mpl-target canvas { width: 100% !important; height: 100% !important; }
      `}</style>
    </div>
  );
}
