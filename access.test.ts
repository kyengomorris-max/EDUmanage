import { describe, expect, it } from "vitest";
import { assertSchoolAccess } from "../src/lib/access.js";
import type { Actor } from "../src/lib/access.js";

function actor(roles: string[], schoolId: string | null): Actor {
  return {
    id: "user",
    email: "user@school.test",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: null,
    schoolId,
    status: "ACTIVE",
    roles,
    permissions: [],
    themePreference: "system",
    sidebarCollapsed: false,
    notifyInApp: true,
    notifyEmail: true,
  };
}

describe("school isolation", () => {
  it("blocks a school user from another school's records", () => {
    expect(() => assertSchoolAccess(actor(["TEACHER"], "school-a"), "school-b")).toThrow(/another school/);
  });

  it("allows a super admin to inspect any school", () => {
    expect(() => assertSchoolAccess(actor(["SUPER_ADMIN"], null), "school-b")).not.toThrow();
  });
});
