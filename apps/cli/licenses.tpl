Third-party code in the metis binary and its licenses.
{{ range . }}
================================================================================
{{ .Name }} {{ .Version }} ({{ .LicenseName }})
{{ .LicenseURL }}

{{ .LicenseText }}
{{ end }}
