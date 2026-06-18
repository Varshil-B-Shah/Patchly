// A form with varied element types: text input, select, checkbox, textarea,
// button — exercises setAttribute / setText / setClassName on non-div elements.
export function SettingsPanel() {
  return (
    <form className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">Workspace Settings</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700">Display name</label>
        <input
          type="text"
          defaultValue="Jane Doe"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Default role</label>
        <select className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand">
          <option>Admin</option>
          <option>Editor</option>
          <option>Viewer</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Bio</label>
        <textarea
          rows="3"
          defaultValue="Building things at Acme."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-brand focus:ring-brand" />
        Email me about activity
      </label>

      <button
        type="button"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Save changes
      </button>
    </form>
  )
}
