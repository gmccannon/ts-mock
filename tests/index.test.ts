import { describe, expect, it } from "vitest";
import { generateMock } from "../src/index";

type UserLevel = 'Admin' | 'Regular' | 'Demo' | 1 | 2 | 3;

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
  level: UserLevel;
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

    expect(mockUser.level).toBeDefined();
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

  it("should be able to override union types", () => {
  const mockUser: UserProfile = generateMock("UserProfile", {
      id: 999,
      level: 'Regular'
    });

  expect(mockUser.id).toBe(999);
  expect(mockUser.level).toBe("Regular");
  })

  it("throws for an unknown type name", () => {
    expect(() => generateMock("DoesNotExist")).toThrow(/not found in project/);
  });
});

type ProfileWithOptional = {
  id: number;
  zip?: string;
  nickname: string | undefined;
};

describe("optional and nullable fields", () => {
  it("fills in optional fields with a real value instead of undefined", () => {
    const mock: ProfileWithOptional = generateMock("ProfileWithOptional");

    expect(mock.id).toBeDefined();
    expect(typeof mock.zip).toBe("string");
    expect(typeof mock.nickname).toBe("string");
  });
});

type TaggedList = {
  tags: string[];
  scores: number[];
  pair: [string, number];
};

describe("arrays and tuples", () => {
  it("mocks array fields as non-empty arrays of the right element type", () => {
    const mock: TaggedList = generateMock("TaggedList");

    expect(Array.isArray(mock.tags)).toBe(true);
    expect(mock.tags.length).toBeGreaterThan(0);
    expect(typeof mock.tags[0]).toBe("string");

    expect(Array.isArray(mock.scores)).toBe(true);
    expect(typeof mock.scores[0]).toBe("number");
  });

  it("mocks tuple fields element-by-element", () => {
    const mock: TaggedList = generateMock("TaggedList");

    expect(Array.isArray(mock.pair)).toBe(true);
    expect(mock.pair).toHaveLength(2);
    expect(typeof mock.pair[0]).toBe("string");
    expect(typeof mock.pair[1]).toBe("number");
  });
});

enum Color {
  Red,
  Green,
  Blue,
}

type Palette = {
  primary: Color;
};

describe("enums", () => {
  it("mocks an enum field to a valid member", () => {
    const mock: Palette = generateMock("Palette");

    expect(Object.values(Color)).toContain(mock.primary);
  });
});

interface LinkedNode {
  value: number;
  next?: LinkedNode;
}

describe("recursive types", () => {
  it("terminates instead of infinitely recursing on a self-referential type", () => {
    const mock: LinkedNode = generateMock("LinkedNode");

    expect(typeof mock.value).toBe("number");
    // `next` bottoms out rather than recursing forever.
    expect(mock.next === null || typeof mock.next === "object").toBe(true);
  });
});

type ClickHandler = {
  onClick: () => void;
  label: string;
};

describe("function-typed properties", () => {
  it("mocks a function field to a callable no-op", () => {
    const mock: ClickHandler = generateMock("ClickHandler");

    expect(typeof mock.onClick).toBe("function");
    expect(() => mock.onClick()).not.toThrow();
  });
});

type Collections = {
  seen: Set<string>;
  lookup: Map<string, number>;
  byId: Record<string, string>;
};

describe("Map, Set, and Record fields", () => {
  it("mocks Map and Set fields to empty instances", () => {
    const mock: Collections = generateMock("Collections");

    expect(mock.seen).toBeInstanceOf(Set);
    expect(mock.lookup).toBeInstanceOf(Map);
  });

  it("mocks Record/index-signature fields to an empty object", () => {
    const mock: Collections = generateMock("Collections");

    expect(mock.byId).toEqual({});
  });
});
