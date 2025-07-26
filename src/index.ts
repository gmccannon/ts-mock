import { Project, ts, Type } from "ts-morph";
import path from "path";
import fs from "fs";

function findTsConfig(startDir: string): string | null {
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

export function generateMock(typeName: string, overrides: Record<string, any> = {}): any {
  const tsconfigPath = findTsConfig(process.cwd()) || path.resolve("./tsconfig.json");

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    skipAddingFilesFromTsConfig: false,
  });

  const sourceFiles = project.getSourceFiles();
  let foundType: Type | undefined;

  for (const sf of sourceFiles) {
    const typeAlias = sf.getTypeAlias(typeName) || sf.getInterface(typeName);
    if (typeAlias) {
      foundType = typeAlias.getType();
      break;
    }

    for (const exportSymbol of sf.getExportSymbols()) {
      if (exportSymbol.getName() === typeName) {
        foundType = exportSymbol.getDeclaredType();
        break;
      }
    }

    if (foundType) break;
  }

  if (!foundType) {
    throw new Error(`Type ${typeName} not found in project`);
  }

  const mock = mockFromType(foundType);
  return deepMerge(mock, overrides);

}

function mockFromType(type: Type): any {
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

function isPlainObject(obj: any): boolean {
  return Object.prototype.toString.call(obj) === "[object Object]";
}

function deepMerge(target: any, source: any): any {
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


