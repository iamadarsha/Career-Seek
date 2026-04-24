export default function Documents() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Documents</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-card-border rounded-apple p-6 shadow-sm">
          <h3 className="font-medium text-lg mb-2">Base Resume</h3>
          <p className="text-sm text-muted-foreground mb-4">No base resume uploaded yet.</p>
          <button className="px-4 py-2 border border-card-border rounded-apple text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            Upload PDF
          </button>
        </div>
        <div className="bg-card border border-card-border rounded-apple p-6 shadow-sm">
          <h3 className="font-medium text-lg mb-2">Generated Documents</h3>
          <p className="text-sm text-muted-foreground">Your tailored resumes and cover letters will appear here.</p>
        </div>
      </div>
    </div>
  );
}
