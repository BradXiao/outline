import { addMonths } from "date-fns";
import { vi } from "vitest";
import { Client } from "@shared/types";
import { buildUser, buildCollection } from "@server/test/factories";
import { getTestServer } from "@server/test/support";
import env from "@server/env";
import { getJWTPayload } from "@server/utils/jwt";
import { signIn } from "@server/utils/authentication";
import { AuthenticationType } from "@server/types";

const server = getTestServer();

describe("auth/redirect", () => {
  it("should redirect to home", async () => {
    const user = await buildUser();
    const res = await server.get(
      `/auth/redirect?token=${user.getTransferToken()}`,
      {
        redirect: "manual",
      }
    );
    expect(res.status).toEqual(302);
    expect(res.headers.get("location")).not.toBeNull();
    expect(res.headers.get("location")!.endsWith("/home")).toBeTruthy();
  });

  it("should redirect to first collection", async () => {
    const collection = await buildCollection();
    const user = await buildUser({
      teamId: collection.teamId,
    });
    const res = await server.get(
      `/auth/redirect?token=${user.getTransferToken()}`,
      {
        redirect: "manual",
      }
    );
    expect(res.status).toEqual(302);
    expect(res.headers.get("location")).not.toBeNull();
    expect(res.headers.get("location")!.includes(collection.path)).toBeTruthy();
  });

  it("should issue a session token with an expiry", async () => {
    const user = await buildUser();
    const before = Date.now();
    const res = await server.get(
      `/auth/redirect?token=${user.getTransferToken()}`,
      {
        redirect: "manual",
      }
    );
    expect(res.status).toEqual(302);

    const cookie = res.headers.get("set-cookie");
    expect(cookie).not.toBeNull();
    const match = cookie!.match(/accessToken=([^;]+)/);
    expect(match).not.toBeNull();

    const payload = getJWTPayload(match![1]);
    expect(payload.type).toEqual("session");
    expect(payload.expiresAt).toBeDefined();

    const expiresAt = new Date(payload.expiresAt as string).getTime();
    const expectedMin = addMonths(before, 3).getTime() - 1000;
    const expectedMax = addMonths(Date.now(), 3).getTime() + 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAt).toBeLessThanOrEqual(expectedMax);
  });

  it("should redirect desktop-authenticated self-hosted installs back to the desktop handoff", async () => {
    const user = await buildUser();
    const originalUrl = env.URL;
    const cookies = new Map<string, string>();
    const redirect = vi.fn();

    env.URL = "https://example.test";

    try {
      await signIn(
        {
          state: {
            auth: {
              user,
              type: AuthenticationType.APP,
            },
            transaction: undefined,
          },
          request: {
            hostname: "example.test",
            ip: "127.0.0.1",
          },
          cookies: {
            get(name: string) {
              return cookies.get(name);
            },
            set(name: string, value: string) {
              cookies.set(name, value);
            },
          },
          redirect,
        },
        "passkeys",
        {
          user,
          team: user.team,
          client: Client.Desktop,
          isNewUser: false,
          isNewTeam: false,
        }
      );
    } finally {
      env.URL = originalUrl;
    }

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect.mock.calls[0][0]).toMatch(
      /^https:\/\/example\.test\/desktop-redirect\?token=/
    );
    expect(cookies.has("accessToken")).toBe(false);
  });

  it("should prevent token extension by rejecting JWT tokens", async () => {
    const user = await buildUser();
    const jwtToken = user.getSessionToken();

    const res = await server.get(`/auth/redirect?token=${jwtToken}`, {
      redirect: "manual",
    });

    expect(res.status).toEqual(401);
  });
});
