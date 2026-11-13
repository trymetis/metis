package version

import _ "embed"

var Version = "0.0.0-dev"

//go:embed licenses.txt
var Licenses string
