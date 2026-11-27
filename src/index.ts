import path from "path";
import fs from "fs";
import { fileURLToPath } from "node:url";
import { CallExpression, Node, Project, SourceFile, Type, ts } from "ts-morph";

const THIS_FILE = fileURLToPath(import.meta.url);

const projectCache = new Map<string, Project>();
const tsconfigCache = new Map<string, string | null>();

export interface MockOptions {
  /**
   * Number of synthetic entries to populate for open `Record<string, V>` / index-signature
   * types (which have no declared key names to go on). Default `0` (mocks to `{}`).
   */
  sampleRecordEntries?: number;
}

interface MockContext {
  seen: Set<ts.Type>;
  options: MockOptions;
}

type DeepPartial<T> = T extends Date | RegExp | Map<any, any> | Set<any> | ((...args: any[]) => any)
  ? T
  : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/**
 * Generates a mock object matching the shape of `T`, with default values filled in and
 * `overrides` applied. `T` must be given explicitly as a type argument — it's resolved by
 * inspecting the call site's source position, not by runtime type inference.
 *
 * @example generateMock<Order>({ items: [...] })
 *
 * @throws Error if no explicit type argument is given, or if the call site can't be resolved.
 */
export function generateMock<T = unknown>(overrides: DeepPartial<T> = {} as DeepPartial<T>, options: MockOptions = {}): T {
  const tsconfigPath = findTsConfig(process.cwd()) || path.resolve("./tsconfig.json");

  let project = projectCache.get(tsconfigPath);
  if (!project) {
    project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
    });
    projectCache.set(tsconfigPath, project);
  }

  const foundType = resolveCallSiteType(project);

  const mock = mockFromType(foundType, { seen: new Set(), options });
  return deepMerge(mock, overrides) as T;
}

function getCallerSite(): { file: string; line: number; column: number } {
  const stackLines = (new Error().stack ?? "").split("\n").slice(1);
  for (const raw of stackLines) {
    const match = /^at\s+(?:.*?\s+\()?(.+):(\d+):(\d+)\)?$/.exec(raw.trim());
    if (!match) continue;
    const [, file, lineStr, colStr] = match;
    if (file === THIS_FILE) continue; // skip frames inside this library's own module
    return { file, line: Number(lineStr), column: Number(colStr) };
  }
  throw new Error(
    "ts-mockgen: could not determine the call site of generateMock<T>(). " +
      "This runtime may not provide the stack trace format this relies on."
  );
}

function resolveCallSiteType(project: Project): Type {
  const site = getCallerSite();
  const absPath = path.resolve(site.file);

  const sourceFile = project.getSourceFile(absPath) ?? project.addSourceFileAtPathIfExists(absPath);
  if (!sourceFile) {
    throw new Error(
      `ts-mockgen: could not locate source file "${absPath}" in the TypeScript project. ` +
        `Make sure it is included by your tsconfig.`
    );
  }

  const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(site.line - 1, site.column - 1);
  const callExpr = findGenerateMockCallExpression(sourceFile, pos, site.line);

  const typeArgs = callExpr.getTypeArguments();
  if (typeArgs.length === 0) {
    throw new Error(
      "ts-mockgen: generateMock<T>() requires an explicit type argument, e.g. generateMock<YourType>()."
    );
  }
  return typeArgs[0].getType();
}

function findGenerateMockCallExpression(sourceFile: SourceFile, pos: number, line: number): CallExpression {
  const nearNode = sourceFile.getDescendantAtPos(pos);
  const direct = nearNode && climbToGenerateMockCall(nearNode);
  if (direct) return direct;

  // Column was imprecise/unavailable — scan the whole line for exactly one candidate.
  const lineStart = sourceFile.compilerNode.getPositionOfLineAndCharacter(line - 1, 0);
  const lineEnd = sourceFile.compilerNode.getPositionOfLineAndCharacter(line, 0);
  const matches: CallExpression[] = [];
  sourceFile.forEachDescendant((node) => {
    if (
      Node.isCallExpression(node) &&
      node.getStart() >= lineStart &&
      node.getStart() < lineEnd &&
      isGenerateMockCallee(node)
    ) {
      matches.push(node);
    }
  });

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`ts-mockgen: could not find a generateMock<T>() call at ${sourceFile.getFilePath()}:${line}.`);
  }
  throw new Error(
    `ts-mockgen: found multiple generateMock(...) calls on ${sourceFile.getFilePath()}:${line} — ` +
      `put each generateMock<T>() call on its own line.`
  );
}

function climbToGenerateMockCall(node: Node): CallExpression | undefined {
  let current: Node | undefined = node;
  while (current) {
    if (Node.isCallExpression(current) && isGenerateMockCallee(current)) return current;
    current = current.getParent();
  }
  return undefined;
}

function isGenerateMockCallee(callExpr: CallExpression): boolean {
  const expr = callExpr.getExpression();
  if (Node.isIdentifier(expr)) {
    if (expr.getText() === "generateMock") return true;
    const defs = expr.getSymbol()?.getDeclarations() ?? [];
    return defs.some((d) => Node.isImportSpecifier(d) && d.getNameNode().getText() === "generateMock");
  }
  if (Node.isPropertyAccessExpression(expr)) return expr.getName() === "generateMock";
  return false;
}

function findTsConfig(startDir: string): string | null {
  const cwd = path.resolve(startDir);
  if (tsconfigCache.has(cwd)) return tsconfigCache.get(cwd)!;

  let currentDir = cwd;
  let result: string | null = null;

  while (true) {
    const tsconfigPath = path.join(currentDir, "tsconfig.json");
    if (fs.existsSync(tsconfigPath)) {
      result = tsconfigPath;
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  tsconfigCache.set(cwd, result);
  return result;
}

const WELL_KNOWN_WRAPPERS = new Set(["Map", "Set", "ReadonlyMap", "ReadonlySet", "Promise"]);

function getWellKnownWrapperName(type: Type<ts.Type>): string | null {
  const symbolName = type.getSymbol()?.getName();
  return symbolName && WELL_KNOWN_WRAPPERS.has(symbolName) ? symbolName : null;
}

function mockFromType(type: Type<ts.Type>, ctx: MockContext): any {
  if (type.isString()) return "example";
  if (type.isNumber()) return 42;
  if (type.isBoolean()) return true;
  if (type.isBigInt()) return BigInt(42);
  if (type.getText() === "Date") return new Date();
  if (type.getText() === "RegExp") return /example/;

  if (type.isEnumLiteral() || type.isEnum()) {
    const members = type.isUnion() ? type.getUnionTypes() : [type];
    const first = members[0];
    return first.getLiteralValue() ?? 0;
  }

  if (type.isTuple()) {
    return type.getTupleElements().map((elementType) => mockFromType(elementType, ctx));
  }

  if (type.isArray() || type.isReadonlyArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return [mockFromType(elementType, ctx)];
  }

  const wrapperName = getWellKnownWrapperName(type);
  if (wrapperName === "Map" || wrapperName === "ReadonlyMap") return new Map();
  if (wrapperName === "Set" || wrapperName === "ReadonlySet") return new Set();
  if (wrapperName === "Promise") {
    const innerType = type.getTypeArguments()[0];
    return Promise.resolve(innerType ? mockFromType(innerType, ctx) : undefined);
  }

  if (type.isUnion()) {
    const unionTypes = type.getUnionTypes();
    const meaningful = unionTypes.filter((t) => !t.isUndefined() && !t.isNull());
    const candidates = meaningful.length > 0 ? meaningful : unionTypes;

    const literalMember = candidates.find((t) => t.getLiteralValue() !== undefined);
    if (literalMember) return literalMember.getLiteralValue();

    if (candidates.length > 0) return mockFromType(candidates[0], ctx);
    return undefined;
  }

  if (type.getCallSignatures().length > 0) {
    return () => undefined;
  }

  if (type.isObject() || type.isIntersection()) {
    const typeKey = type.compilerType;
    if (ctx.seen.has(typeKey)) return null;

    ctx.seen.add(typeKey);
    try {
      const properties = type.getProperties();
      const mock: Record<string, any> = {};

      for (const prop of properties) {
        const declaration = prop.getValueDeclaration();
        if (!declaration) {
          mock[prop.getName()] = null;
          continue;
        }

        const propType = prop.getTypeAtLocation(declaration);
        mock[prop.getName()] = mockFromType(propType, ctx);
      }

      const sampleRecordEntries = ctx.options.sampleRecordEntries ?? 0;
      if (sampleRecordEntries > 0) {
        const stringIndexType = type.getStringIndexType();
        const numberIndexType = type.getNumberIndexType();

        if (stringIndexType) {
          for (let i = 1; i <= sampleRecordEntries; i++) {
            mock[`exampleKey${i}`] = mockFromType(stringIndexType, ctx);
          }
        } else if (numberIndexType) {
          for (let i = 0; i < sampleRecordEntries; i++) {
            mock[i] = mockFromType(numberIndexType, ctx);
          }
        }
      }

      return mock;
    } finally {
      ctx.seen.delete(typeKey);
    }
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
