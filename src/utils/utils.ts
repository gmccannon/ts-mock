import path from "path";
import { Type, ts } from "ts-morph";
import fs from "fs";

export function findTsConfig(startDir: string): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const tsconfigPath = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) return tsconfigPath;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

export function mockFromType(type: Type<ts.Type>): any {
  if (type.isString()) return "example";
  if (type.isNumber()) return 42;
  if (type.isBoolean()) return true;
  if (type.getText() === "Date") return new Date();

  const unionTypes = type.isUnion() ? type.getUnionTypes() : [];
  if (unionTypes.length > 0) {
    return unionTypes[0].getLiteralValue();
  }

  if (type.isObject()) {
    const properties = type.getProperties();
    const mock: Record<string, any> = {};

    for (const prop of properties) {
      const propType = prop.getTypeAtLocation(prop.getValueDeclarationOrThrow());
      mock[prop.getName()] = mockFromType(propType);
    }

    return mock;
  }

  return null;
}


export function isPlainObject(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

export function deepMerge(target: any, source: any): any {
  if (typeof source !== "object" || source === null) return source;

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      isPlainObject(srcVal) &&
      isPlainObject(tgtVal)
    ) {
      target[key] = deepMerge(tgtVal, srcVal);
    } else {
      target[key] = srcVal;
    }
  }

  return target;
}
