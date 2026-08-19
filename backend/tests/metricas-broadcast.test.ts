import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventBroker } from "../src/lib/event-broker.js";
import {
  METRICAS_BROADCAST_WINDOW_MS,
  __resetMetricasBroadcastForTests,
  scheduleMetricasBroadcast,
} from "../src/lib/metricas-broadcast.js";

describe("metricas-broadcast — debounce de ventana fija (docs/08-dashboard-kpis.md §5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetMetricasBroadcastForTests();
  });

  afterEach(() => {
    __resetMetricasBroadcastForTests();
    vi.useRealTimers();
  });

  it("agrupa dos llamadas dentro de la ventana en un único broadcast tras 2000ms", () => {
    const spy = vi.spyOn(eventBroker, "broadcastAll").mockImplementation(() => {});

    scheduleMetricasBroadcast();
    scheduleMetricasBroadcast();
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(METRICAS_BROADCAST_WINDOW_MS);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("metricas.actualizadas", {});
    spy.mockRestore();
  });

  it("una llamada posterior al disparo de la ventana abre una ventana nueva e independiente", () => {
    const spy = vi.spyOn(eventBroker, "broadcastAll").mockImplementation(() => {});

    scheduleMetricasBroadcast();
    vi.advanceTimersByTime(METRICAS_BROADCAST_WINDOW_MS);
    expect(spy).toHaveBeenCalledTimes(1);

    scheduleMetricasBroadcast();
    vi.advanceTimersByTime(METRICAS_BROADCAST_WINDOW_MS);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
