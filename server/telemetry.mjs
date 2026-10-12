/* Anonymous live telemetry reporter for watashiad.vercel.app/controll-d
 *
 * Transmits an ephemeral random session UUID (zero PII) to track
 * active concurrent users in real time.
 */

import { randomUUID } from "node:crypto";
import os from "node:os";

export class TelemetryReporter {
  constructor(cfg) {
    this.enabled = cfg.telemetry !== false;
    this.url = cfg.telemetryUrl || "https://watashiad.vercel.app/api/controll-d/heartbeat";
    this.instanceId = randomUUID();
    this.platform = os.platform();
    this.timer = null;
    this.state = null;
  }

  start(state) {
    this.state = state;
    if (!this.enabled || !this.url) return;
    this.sendPing("online");
    this.timer = setInterval(() => {
      this.sendPing("heartbeat");
    }, 45000);
    if (this.timer.unref) this.timer.unref();
  }

  setEnabled(enabled) {
    const next = Boolean(enabled);
    if (this.enabled === next) return;
    this.enabled = next;
    if (this.enabled) {
      if (!this.timer && this.state) {
        this.start(this.state);
      }
    } else {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      this.sendPing("offline");
    }
  }

  notifySessionChange() {
    if (!this.enabled) return;
    this.sendPing("client_change");
  }

  sendPing(event = "heartbeat") {
    if (!this.enabled || !this.url) return;
    const clients = this.state?.active ? 1 : 0;
    const padActive = this.state?.pad !== null;

    const payload = {
      instanceId: this.instanceId,
      event,
      version: "1.0.0",
      platform: this.platform,
      clients,
      padActive,
      ts: Date.now(),
    };

    fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {
      /* Fire-and-forget: fail completely silently on offline / missing backend */
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.enabled) return;
    this.sendPing("offline");
  }
}
