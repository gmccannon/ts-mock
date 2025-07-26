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

export function mockFromType(type: Type): any {
  if (type.isString()) return "string";
  if (type.isNumber()) return 1;
  if (type.isBoolean()) return true;
  if (type.getText() === "Date") return new Date();
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return [mockFromType(elementType)];
  }
  if (type.isEnum() || type.isEnumLiteral()) {
    const enumMembers = type.getSymbol()?.getDeclarations()[0].getChildrenOfKind?.(ts.SyntaxKind.EnumMember);
    if (enumMembers && enumMembers.length > 0) {
      return enumMembers[0].getText();
    }
    return null;
  }
  if (type.isObject() || type.isClassOrInterface()) {
    const obj: any = {};
    const props = type.getProperties();
    for (const prop of props) {
      const name = prop.getName();
      const declarations = prop.getDeclarations();
      if (declarations.length === 0) continue;
      const propType = declarations[0].getType();
      obj[name] = mockFromType(propType);
    }
    return obj;
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
