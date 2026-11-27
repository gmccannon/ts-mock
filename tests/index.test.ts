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
    const mockUser = generateMock<UserProfile>();

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
    const mockUser = generateMock<UserProfile>({
      name: "George",
      address: { city: "Akron" },
    });

    expect(mockUser.name).toBe("George");
    expect(mockUser.address.city).toBe("Akron");
    expect(mockUser.address.zip).toBeDefined(); // not overridden, should be mocked
  });

  it("applies overrides deeply", () => {
    const mockUser = generateMock<UserProfile>({
      preferences: { theme: "light" },
    });

    expect(mockUser.preferences.theme).toBe("light");
    expect(mockUser.preferences.notifications).toBeDefined();
  });

  it("overrides only some values and preserves the rest", () => {
    const mockUser = generateMock<UserProfile>({
      id: 999,
      createdAt: new Date("2020-01-01"),
    });

    expect(mockUser.id).toBe(999);
    expect(mockUser.createdAt.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(mockUser.name).toBeDefined();
    expect(mockUser.address.city).toBeDefined();
  });

  it("should be able to override union types", () => {
    const mockUser = generateMock<UserProfile>({
      id: 999,
      level: 'Regular'
    });

    expect(mockUser.id).toBe(999);
    expect(mockUser.level).toBe("Regular");
  })

  it("throws when no explicit type argument is given", () => {
    expect(() => generateMock()).toThrow(/explicit type argument/);
  });
});

type ProfileWithOptional = {
  id: number;
  zip?: string;
  nickname: string | undefined;
};

describe("optional and nullable fields", () => {
  it("fills in optional fields with a real value instead of undefined", () => {
    const mock = generateMock<ProfileWithOptional>();

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
    const mock = generateMock<TaggedList>();

    expect(Array.isArray(mock.tags)).toBe(true);
    expect(mock.tags.length).toBeGreaterThan(0);
    expect(typeof mock.tags[0]).toBe("string");

    expect(Array.isArray(mock.scores)).toBe(true);
    expect(typeof mock.scores[0]).toBe("number");
  });

  it("mocks tuple fields element-by-element", () => {
    const mock = generateMock<TaggedList>();

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
    const mock = generateMock<Palette>();

    expect(Object.values(Color)).toContain(mock.primary);
  });
});

describe("top-level enum lookup", () => {
  it("mocks an enum type looked up directly as the type argument", () => {
    const mock = generateMock<Color>();
    expect(Object.values(Color)).toContain(mock);
  });
});

interface LinkedNode {
  value: number;
  next?: LinkedNode;
}

describe("recursive types", () => {
  it("terminates instead of infinitely recursing on a self-referential type", () => {
    const mock = generateMock<LinkedNode>();

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
    const mock = generateMock<ClickHandler>();

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
    const mock = generateMock<Collections>();

    expect(mock.seen).toBeInstanceOf(Set);
    expect(mock.lookup).toBeInstanceOf(Map);
  });

  it("mocks Record/index-signature fields to an empty object by default", () => {
    const mock = generateMock<Collections>();

    expect(mock.byId).toEqual({});
  });

  it("populates sample Record entries when sampleRecordEntries is set", () => {
    const mock = generateMock<Collections>({}, { sampleRecordEntries: 2 });

    const keys = Object.keys(mock.byId);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(typeof mock.byId[key]).toBe("string");
    }
  });
});

type ReadonlyCollections = {
  tags: ReadonlyArray<string>;
  seen: ReadonlySet<string>;
  lookup: ReadonlyMap<string, number>;
};

describe("readonly collection fields", () => {
  it("mocks ReadonlyArray/ReadonlySet/ReadonlyMap fields like their mutable counterparts", () => {
    const mock = generateMock<ReadonlyCollections>();

    expect(Array.isArray(mock.tags)).toBe(true);
    expect(typeof mock.tags[0]).toBe("string");
    expect(mock.seen).toBeInstanceOf(Set);
    expect(mock.lookup).toBeInstanceOf(Map);
  });
});

type ExtraPrimitives = {
  bigNumber: bigint;
  pattern: RegExp;
};

describe("bigint and RegExp fields", () => {
  it("mocks a bigint field to a real bigint", () => {
    const mock = generateMock<ExtraPrimitives>();
    expect(typeof mock.bigNumber).toBe("bigint");
  });

  it("mocks a RegExp field to a real RegExp", () => {
    const mock = generateMock<ExtraPrimitives>();
    expect(mock.pattern).toBeInstanceOf(RegExp);
  });
});

type AsyncProfile = {
  userId: Promise<number>;
};

describe("Promise fields", () => {
  it("mocks a Promise<T> field to a promise that resolves to a mocked T", async () => {
    const mock = generateMock<AsyncProfile>();

    expect(mock.userId).toBeInstanceOf(Promise);
    await expect(mock.userId).resolves.toBe(42);
  });
});

type HasName = { a: string };
type HasAge = { b: number };
type Intersected = HasName & HasAge;

describe("intersection types", () => {
  it("mocks an intersection type with properties from every member", () => {
    const mock = generateMock<Intersected>();

    expect(typeof mock.a).toBe("string");
    expect(typeof mock.b).toBe("number");
  });
});
