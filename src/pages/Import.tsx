import { Upload, FileSpreadsheet } from 'lucide-react'

export default function Import() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <p className="text-muted-foreground">
          Importez vos données depuis Google Sheets ou Phantombuster.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Google Sheets</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Importez vos fichiers entreprises et contacts au format .xlsx ou .csv.
          </p>
          <button
            disabled
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50 cursor-not-allowed"
          >
            <Upload className="h-4 w-4" />
            Importer (bientôt)
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <Upload className="h-8 w-8 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Phantombuster</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Configurez le webhook Phantombuster pour recevoir les données de scraping LinkedIn.
          </p>
          <button
            disabled
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50 cursor-not-allowed"
          >
            Configurer (bientôt)
          </button>
        </div>
      </div>
    </div>
  )
}
