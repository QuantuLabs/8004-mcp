#!/bin/bash
# Test Analysis Script - Identifies redundant tests and provides statistics

echo "========================================"
echo "   8004-MCP Test Analysis Report"
echo "========================================"
echo ""

cd "$(dirname "$0")/.."

# 1. Overall Statistics
echo "=== 1. OVERALL STATISTICS ==="
total_files=$(find tests -name "*.test.ts" | wc -l | tr -d ' ')
total_tests=$(find tests -name "*.test.ts" -exec grep -c "it(" {} \; | awk '{sum+=$1} END {print sum}')
echo "Total test files: $total_files"
echo "Total test cases: $total_tests"
echo ""

# 2. Tests by Category
echo "=== 2. TESTS BY CATEGORY ==="
unit_core=$(find tests/unit/core -name "*.test.ts" -exec grep -c "it(" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
unit_chains=$(find tests/unit/chains -name "*.test.ts" -exec grep -c "it(" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
unit_tools=$(find tests/unit/tools -name "*.test.ts" -exec grep -c "it(" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
e2e=$(find tests/e2e -name "*.test.ts" -exec grep -c "it(" {} \; 2>/dev/null | awk '{sum+=$1} END {print sum+0}')

echo "Unit - Core:   $unit_core tests"
echo "Unit - Chains: $unit_chains tests"
echo "Unit - Tools:  $unit_tools tests"
echo "E2E:           $e2e tests"
echo ""

# 3. Top 15 largest test files
echo "=== 3. TOP 15 LARGEST TEST FILES ==="
for f in $(find tests -name "*.test.ts"); do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "$count $f"
done | sort -rn | head -15
echo ""

# 4. Duplicate test names (potential redundancy)
echo "=== 4. DUPLICATE TEST NAMES (>2 occurrences) ==="
find tests -name "*.test.ts" -exec awk -F"'" '/it\(/ {print $2}' {} \; 2>/dev/null | sort | uniq -c | sort -rn | awk '$1 > 2 {print}'
echo ""

# 5. Similar test files (potential consolidation)
echo "=== 5. SIMILAR TEST FILE GROUPS ==="
echo ""
echo "Agent-related tests:"
ls -1 tests/unit/tools/agent*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Feedback-related tests:"
ls -1 tests/unit/tools/feedback*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Collection-related tests:"
ls -1 tests/unit/tools/collection*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Config-related tests:"
ls -1 tests/unit/tools/config*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "IPFS-related tests:"
ls -1 tests/unit/tools/ipfs*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Wallet-related tests:"
ls -1 tests/unit/tools/wallet*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Reputation-related tests:"
ls -1 tests/unit/tools/reputation*.test.ts 2>/dev/null | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

# 6. E2E test overlap analysis
echo ""
echo "=== 6. E2E TEST FILE ANALYSIS ==="
echo ""
echo "Solana E2E tests:"
ls -1 tests/e2e/*solana*.test.ts tests/e2e/*sol*.test.ts 2>/dev/null | sort -u | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "EVM E2E tests:"
ls -1 tests/e2e/*evm*.test.ts tests/e2e/*eth*.test.ts 2>/dev/null | sort -u | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

echo ""
echo "Other E2E tests:"
ls -1 tests/e2e/*.test.ts 2>/dev/null | grep -v -E "solana|sol-|evm|eth-" | while read f; do
  count=$(grep -c "it(" "$f" 2>/dev/null || echo 0)
  echo "  $count tests: $(basename $f)"
done

# 7. Check for exact duplicate test content
echo ""
echo "=== 7. CHECKING FOR EXACT DUPLICATE TESTS ==="
temp_file=$(mktemp)
find tests -name "*.test.ts" -exec awk '/it\(/,/\}\);/ {print FILENAME": "$0}' {} \; 2>/dev/null > "$temp_file"
echo "Total test blocks extracted: $(grep -c "it(" "$temp_file" 2>/dev/null || echo 0)"
rm -f "$temp_file"

# 8. Recommendations
echo ""
echo "=== 8. RECOMMENDATIONS ==="
echo ""
echo "Files that could potentially be consolidated:"
echo ""

# Check for -null-provider, -globalid, -writable patterns
echo "Pattern: *-null-provider.test.ts (edge case tests)"
ls -1 tests/unit/tools/*-null-provider.test.ts 2>/dev/null | while read f; do
  base=$(basename "$f" | sed 's/-null-provider.test.ts/.test.ts/')
  if [ -f "tests/unit/tools/$base" ]; then
    echo "  -> $(basename $f) could merge into $base"
  fi
done

echo ""
echo "Pattern: *-globalid.test.ts (global ID handling tests)"
ls -1 tests/unit/tools/*-globalid.test.ts 2>/dev/null | while read f; do
  base=$(basename "$f" | sed 's/-globalid.test.ts/.test.ts/')
  if [ -f "tests/unit/tools/$base" ]; then
    echo "  -> $(basename $f) could merge into $base"
  fi
done

echo ""
echo "========================================"
echo "   Analysis Complete"
echo "========================================"
