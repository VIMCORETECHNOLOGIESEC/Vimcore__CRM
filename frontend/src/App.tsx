// Página marcador de posición: confirma que el frontend se sirve y que los
// estilos de Tailwind se aplican. Sin lógica de negocio (fuera del alcance
// de este cambio, ver AGENTS.md §5).
function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="rounded-lg bg-white p-10 shadow-md">
        <h1 className="text-3xl font-bold text-slate-800">
          CRM Embudo de Leads
        </h1>
        <p className="mt-2 text-slate-500">
          Entorno de desarrollo listo. Frontend en construcción.
        </p>
      </div>
    </main>
  );
}

export default App;
