# TRUEPRINT Member 2 - consolidated local smoke test
# Run this from the backend folder while uvicorn is running on 127.0.0.1:8000.
# Creates QA-only synthetic drafts. Never publish them or treat synthetic claims as brand evidence.
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://127.0.0.1:8000'

function Pass([string]$Message) { Write-Host "[PASS] $Message" -ForegroundColor Green }
function New-Session([string]$Role) {
    $body = @{ role = $Role; name = "Trueprint QA $Role" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$BaseUrl/auth/demo-login" -Method Post -ContentType 'application/json' -Body $body
    if (-not $r.access_token) { throw "Login failed for role: $Role" }
    return @{ Authorization = "Bearer $($r.access_token)" }
}
function Call-Api([string]$Method, [string]$Path, [hashtable]$Headers, $Body = $null) {
    $params = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $Headers }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json'
        $params.Body = $Body | ConvertTo-Json -Depth 10
    }
    return Invoke-RestMethod @params
}

Write-Host "`n=== TRUEPRINT BACKEND QA ===" -ForegroundColor Cyan
$health = Call-Api 'GET' '/health' @{}
if ($health.status -ne 'healthy') { throw 'Health check failed' }
Pass 'Health'

$admin = New-Session 'admin'
$creator = New-Session 'creator'
$reviewer = New-Session 'reviewer'
$manager = New-Session 'manager'
Pass 'Demo sessions: admin, creator, reviewer, manager'

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$content = 'Our serum is clinically proven to remove acne in 7 days, guaranteed and 100% effective. Dermatologist-tested.'
$draft = Call-Api 'POST' '/drafts' $creator @{
    title = "QA ONLY - DO NOT PUBLISH - $stamp"; channel = 'instagram'; content = $content
}
$draftId = [string]$draft.id
Pass "QA draft created: $draftId"

$review = Call-Api 'POST' "/drafts/$draftId/review" $creator
$findings = @($review.findings)
$clinical = $findings | Where-Object { $_.flagged_text -eq 'clinically proven' } | Select-Object -First 1
$sevenDay = $findings | Where-Object { $_.flagged_text -eq 'remove acne in 7 days' } | Select-Object -First 1
$guaranteed = $findings | Where-Object { $_.flagged_text -eq 'guaranteed' } | Select-Object -First 1
$effective = $findings | Where-Object { $_.flagged_text -eq '100% effective' } | Select-Object -First 1
if (-not $clinical -or -not $sevenDay -or -not $guaranteed -or -not $effective) {
    throw "High-risk review check failed. Findings returned: $($findings.Count)"
}
Pass 'Deterministic high-risk phrase findings (4)'

$version1 = @(Call-Api 'GET' "/drafts/$draftId/versions" $creator)
if ($version1.Count -ne 1) { throw "Expected one initial version; found $($version1.Count)" }
$edit = Call-Api 'PATCH' "/findings/$($clinical.id)" $creator @{
    action = 'edit'; edited_text = 'evidence-backed'; reason = 'QA-only edit action test.'
}
if ($edit.status -ne 'edited') { throw 'Finding edit did not return edited status' }
$updatedDraft = Call-Api 'GET' "/drafts/$draftId" $creator
$versions = @(Call-Api 'GET' "/drafts/$draftId/versions" $creator)
if ($updatedDraft.content -notlike '*evidence-backed*' -or $versions.Count -ne 2) {
    throw 'Finding edit did not update actual draft content and create a version.'
}
Pass 'Finding edit updates draft content + immutable version history'

$comment = Call-Api 'POST' "/drafts/$draftId/comments" $manager @{
    body = 'QA-only comment: reviewer checked the synthetic claim finding.'; finding_id = [string]$clinical.id
}
$comments = @(Call-Api 'GET' "/drafts/$draftId/comments" $manager)
if (-not $comment.id -or $comments.Count -lt 1) { throw 'Comment API failed' }
$diff = Call-Api 'GET' "/drafts/$draftId/diff" $manager
Pass 'Comments and version diff'

$accepted = Call-Api 'PATCH' "/findings/$($sevenDay.id)" $reviewer @{
    action = 'accept'; reason = 'QA-only reviewer acceptance test.'
}
$dismissed = Call-Api 'PATCH' "/findings/$($guaranteed.id)" $reviewer @{
    action = 'dismiss'; reason = 'QA-only dismissal test; not publication approval.'
}
if ($accepted.status -ne 'accepted' -or $dismissed.status -ne 'dismissed') { throw 'Accept/dismiss action failed' }
Pass 'Reviewer accept and dismiss actions'

$blocked = $false
try { $null = Call-Api 'POST' "/drafts/$draftId/approve" $manager }
catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch { }
    if ($code -eq 409 -or $_.Exception.Message -match 'sign-off') { $blocked = $true } else { throw }
}
if (-not $blocked) { throw 'Manager approval was not blocked before specialist sign-off' }
$signoff = Call-Api 'POST' "/drafts/$draftId/reviewer-signoff" $reviewer @{
    reason = 'Specialist reviewed the remaining high-risk QA finding; demo only.'
}
if (-not $signoff.signed_off) { throw 'Reviewer sign-off failed' }
$submitted = Call-Api 'POST' "/drafts/$draftId/submit" $creator
$approved = Call-Api 'POST' "/drafts/$draftId/approve" $manager
if ($submitted.status -ne 'submitted' -or $approved.status -ne 'approved') { throw 'Submit/approve flow failed' }
Pass 'Reviewer sign-off gate, creator submit, manager approval'

$audit = @(Call-Api 'GET' '/audit?limit=100' $manager)
$insights = Call-Api 'GET' '/insights' $manager
if ($audit.Count -lt 1 -or $null -eq $insights.draft_count) { throw 'Audit/insights failed' }
Pass 'Audit and insights'

# Agent findings import contract: quoted text and zero-based offsets are validated.
$agentDraft = Call-Api 'POST' '/drafts' $creator @{
    title = "QA ONLY - AI import contract - $stamp"; channel = 'other'; content = 'This is a test caption.'
}
$agentImport = Call-Api 'POST' "/drafts/$($agentDraft.id)/findings/import" $reviewer @{
    findings = @(@{
        category = 'voice'; flagged_text = 'test caption'; start = 10; end = 22
        reason = 'QA voice-agent tone finding.'; severity = 'medium'; confidence = 0.88
        source_type = 'guideline'; source_quote = 'Use warm and clear language.'
        suggested_fix = 'Use warmer wording.'; validated = $true
    })
}
if ($agentImport.imported_count -ne 1) { throw 'AI findings import contract failed' }
Pass 'AI agent finding import contract'

# Draft PATCH must also create a version when content changes.
$editable = Call-Api 'POST' '/drafts' $creator @{
    title = "QA ONLY - draft update - $stamp"; channel = 'other'; content = 'Before edit.'
}
$patchedDraft = Call-Api 'PATCH' "/drafts/$($editable.id)" $creator @{ content = 'After edit.' }
$patchedVersions = @(Call-Api 'GET' "/drafts/$($editable.id)/versions" $creator)
if ($patchedDraft.content -ne 'After edit.' -or $patchedVersions.Count -ne 2) { throw 'Draft PATCH/version test failed' }
Pass 'Direct draft edit and version history'

$contrast = Call-Api 'POST' '/checks/contrast' $admin @{ foreground = '#000000'; background = '#FFFFFF' }
$alt = Call-Api 'POST' '/checks/alt-text' $admin @{ image_count = 1; alt_texts = @('Serum bottle on a white background') }
if (-not $contrast.passes -or -not $alt.passes) { throw 'Accessibility utility check failed' }
Pass 'Contrast and alt-text utilities'

Write-Host "`n=== SMOKE TEST PASSED ===" -ForegroundColor Green
Write-Host "QA draft ID: $draftId"
Write-Warning 'This is a synthetic QA draft. Do not publish it or use it as real product evidence.'
Write-Warning 'This validates local API behavior, not production identity, tenant isolation, or hosting security.'
