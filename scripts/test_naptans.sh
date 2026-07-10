#!/bin/bash
echo "=== Testing expanded NaPTANs from HUB codes ==="
echo ""

# For each HUB, resolve to NaPTANs and test each
test_naptan() {
  local desc="$1"
  shift
  for naptan in "$@"; do
    count=$(curl -s --max-time 4 "https://my-commute-brain.vercel.app/api/stations/$naptan" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('departures',[])))" 2>/dev/null)
    if [ "$count" = "" ]; then count="ERR"; fi
    if [ "$count" = "0" ]; then marker="❌ EMPTY"; else marker="✅ OK"; fi
    echo "$marker $naptan ($desc) → $count"
  done
}

# Canary Wharf
test_naptan "Canary Wharf Jubilee" 940GZZLUCYF
test_naptan "Canary Wharf DLR" 940GZZDLCAN
test_naptan "Canary Wharf Lizzie" 910GCANWHRF

# Bank
test_naptan "Bank" 940GZZLUBNK
test_naptan "Bank DLR" 940GZZDLBNK

# Paddington
test_naptan "Paddington Bakerloo/District" 940GZZLUPAC
test_naptan "Paddington H&C/Circle" 940GZZLUPAH

# Liverpool Street
test_naptan "Liverpool St U'ground" 940GZZLULVT
test_naptan "Liverpool St Rail" 910GLIVST

# Stratford
test_naptan "Stratford U'ground" 940GZZLUSTD
test_naptan "Stratford Rail" 910GSTFD

# London Bridge
test_naptan "London Bridge" 940GZZLULNB

# Highbury & Islington
test_naptan "Highbury & Islington Vic" 940GZZLUHAI
test_naptan "Highbury & Islington LO" 910GHGHI

# Richmond
test_naptan "Richmond District" 940GZZLURMD
test_naptan "Richmond LO" 910GRICHMND

# King's Cross
test_naptan "King's Cross" 940GZZLUKSX

# Vauxhall
test_naptan "Vauxhall Victoria" 940GZZLUVXL

# Euston
test_naptan "Euston U'ground" 940GZZLUEUS
test_naptan "Euston Rail" 910GEUSTON

# Wimbledon
test_naptan "Wimbledon District" 940GZZLUWIM
test_naptan "Wimbledon Rail" 910GWIMBLDN

# Tottenham Court Road
test_naptan "TCR U'ground" 940GZZLUTCR
test_naptan "TCR Lizzie" 910GTOTCTRD

# Bond Street
test_naptan "Bond St U'ground" 940GZZLUBND
test_naptan "Bond St Lizzie" 910GBONDST

# Farringdon
test_naptan "Farringdon U'ground" 940GZZLUFCN
test_naptan "Farringdon Lizzie" 910GFRNDXR

echo ""
echo "=== Extra stations user reported ==="
# Specific stations the user flagged
test_naptan "St Paul's corrected" 940GZZLUSPU
test_naptan "St Paul's OLD wrong" 940GZZLUSTP
