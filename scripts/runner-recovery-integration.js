async function runnerRecovery(app, context) {
  const plugin = app.plugins.plugins["patches"];
  await plugin.setMathFormat({ ...plugin.settings.mathFormat, indent: plugin.settings.mathFormat.indent === 2 ? 4 : 2 });
  app.saveLocalStorage("obsidian-patch-table-editor-size", { width: 777, height: 555 });
  app.saveLocalStorage("obsidian-patch-callout-editor-size", { width: 888, height: 666 });
  if (context.options.mode === "failure") throw new Error("Intentional recovery-check failure");
  if (context.options.mode === "timeout") await context.wait(60000);
  context.report.checks.push("the suite reached its final operation");
}
