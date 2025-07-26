import { describe, expect, it } from "vitest";
import { generateMock } from "../src/index";

type UserProfile = {
  id: number;
  name: string;
  address: {
    city: string;
    zip: string;
  };
  preferences: {
    theme: string;
    notifications: boolean;
  };
  createdAt: Date;
};

describe("generateMock", () => {
  it("generates mock with all fields filled", () => {
    const mockUser: UserProfile = generateMock("UserProfile");

    expect(mockUser.id).toBeDefined();
    expect(typeof mockUser.id).toBe("number");

    expect(mockUser.name).toBeDefined();
    expect(typeof mockUser.name).toBe("string");

    expect(mockUser.address).toBeDefined();
    expect(typeof mockUser.address.city).toBe("string");
    expect(typeof mockUser.address.zip).toBe("string");

    expect(mockUser.preferences).toBeDefined();
    expect(typeof mockUser.preferences.theme).toBe("string");
    expect(typeof mockUser.preferences.notifications).toBe("boolean");

    expect(mockUser.createdAt).toBeDefined();
    expect(mockUser.createdAt).toBeInstanceOf(Date);
    expect(!isNaN(mockUser.createdAt.getTime())).toBe(true);
  });

  it("respects overrides", () => {
    const mockUser: UserProfile = generateMock("UserProfile", {
      name: "George",
      address: { city: "Akron" },
    });

    expect(mockUser.name).toBe("George");
    expect(mockUser.address.city).toBe("Akron");
    expect(mockUser.address.zip).toBeDefined(); // not overridden, should be mocked
  });

  it("applies overrides deeply", () => {
    const mockUser: UserProfile = generateMock("UserProfile", {
      preferences: { theme: "light" },
    });

    expect(mockUser.preferences.theme).toBe("light");
    expect(mockUser.preferences.notifications).toBeDefined();
  });

  it("overrides only some values and preserves the rest", () => {
    const mockUser: UserProfile = generateMock("UserProfile", {
      id: 999,
      createdAt: new Date("2020-01-01"),
    });

    expect(mockUser.id).toBe(999);
    expect(mockUser.createdAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(mockUser.name).toBeDefined();
    expect(mockUser.address.city).toBeDefined();
  });
});
