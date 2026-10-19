import { Linter } from "eslint";

export function scriptBindings(source) {
  let bindings;
  const messages = new Linter().verify(source, {
    languageOptions: { ecmaVersion: 2022, sourceType: "script" },
    plugins: {
      contract: {
        rules: {
          bindings: {
            create(context) {
              return {
                "Program:exit"(node) {
                  const variables = context.sourceCode.getScope(node).variables;
                  bindings = {
                    declared: variables.filter((v) => v.defs.length).map((v) => v.name),
                    required: variables.filter((v) => v.eslintExplicitGlobal).map((v) => v.name),
                  };
                },
              };
            },
          },
        },
      },
    },
    rules: { "contract/bindings": "error" },
  });
  if (messages.length) throw new Error(messages.map((m) => m.message).join("\n"));
  return bindings;
}

export function checkBindings(window, scripts) {
  const owners = new Map();
  for (const { file, source } of scripts) {
    const { declared, required } = scriptBindings(source);
    for (const name of required) {
      if (!owners.has(name) && !(name in window)) {
        throw new Error(`${file}: ${name} needs a script loaded earlier`);
      }
    }
    for (const name of declared) {
      if (owners.has(name)) throw new Error(`${file}: duplicate ${name} from ${owners.get(name)}`);
      owners.set(name, file);
    }
  }
  return owners;
}
