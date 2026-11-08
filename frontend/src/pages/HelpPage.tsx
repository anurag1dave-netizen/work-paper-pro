import { Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const S = ({ id, t, children }: { id: string; t: string; children: React.ReactNode }) => (
  <section id={id} className="mb-6 break-inside-avoid rounded-lg border bg-card p-5">
    <h2 className="mb-2 text-lg font-semibold text-primary">{t}</h2><div className="space-y-2 text-sm leading-relaxed">{children}</div>
  </section>);
const Ol = ({ items }: { items: string[] }) => <ol className="list-decimal space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
const Ul = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;

export function HelpPage() {
  const toc = [["start", "1. Getting started"], ["home", "2. Home screen"], ["eng", "3. Engagements"], ["copy", "4. Copy forward"], ["wp", "5. Working papers"], ["sign", "6. Sign-offs"], ["prof", "7. Company profile and import"], ["docs", "8. Documents"], ["pack", "9. Packs, zip and combined PDF"], ["clause", "10. Clause library"], ["firm", "11. Firm settings"], ["find", "12. Search"], ["look", "13. Appearance"], ["data", "14. Backup and password"], ["fix", "15. Troubleshooting"], ["tips", "16. Good practice"]];
  return (
    <main className="mx-auto max-w-[900px] px-5 py-5">
      <div className="mb-4 flex items-end justify-between print:hidden">
        <div><Link to="/" className="text-xs text-accent hover:underline">← All engagements</Link>
          <h1 className="text-xl font-semibold text-primary">User manual</h1></div>
        <Button variant="outline" onClick={() => window.print()}><Printer /> Print / save as PDF</Button>
      </div>
      <h1 className="hidden text-2xl font-semibold print:block">Work Paper Pro - User manual</h1>
      <p className="mb-4 text-sm text-muted-foreground">Work Paper Pro prepares ICAI-format audit working papers and the firm's standard letters, certificates, resolutions and proposals. It runs only on this computer; nothing is sent over the internet.</p>
      <nav className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm print:hidden">{toc.map(([id, l]) => <a key={id} href={`#/help`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }} className="text-accent hover:underline">{l}</a>)}</nav>

      <S id="start" t="1. Getting started">
        <Ol items={[
          "Start the app (double-click WorkPaperPro.exe, or run.bat). The app opens in its own window. Closing the window stops the app.",
          "Click Firm settings (top right) and enter your firm name, FRN, PAN, address, place of signing, tagline, contact line and the partners who sign. This is done once and appears on every letter, certificate and proposal. Until it is done, a banner shows on the home page.",
          "Open Clause library and review the standard proposal and representation-letter wording (section 10). Optionally upload your firm logo in Firm settings.",
          "Click New engagement to create the first client.",
        ]} />
      </S>

      <S id="home" t="2. Home screen">
        <p>Home is the firm's control panel.</p>
        <Ul items={[
          "Four tiles show the number of clients, working papers awaiting review (prepared or reviewed), papers approved, and documents created this month.",
          "Due dates lists engagements with a due date, earliest first. Red means overdue; amber means due within 14 days.",
          "Client tracker lists every client with the year end, due date, a progress ring (share of the working papers approved), status counts and number of documents. Filter by name, or sort by newest, due date or A-Z.",
          "The buttons on each row: Open, Copy forward, Settings and Delete.",
        ]} />
      </S>

      <S id="eng" t="3. Engagements">
        <p>An engagement is one client for one financial year. It holds that client's working papers, company profile, documents and activity log.</p>
        <Ul items={[
          "New engagement: enter client name, financial year end, optional due date, nature of engagement and the engagement team (preparer, reviewer, approver). Firm name and FRN are filled from Firm settings.",
          "Save & add another saves the engagement and keeps the form open so several clients can be entered one after another. Clear fields empties the form.",
          "Settings on a card edits the engagement. The bin icon deletes the engagement together with its working papers, documents and sign-offs, after a confirmation. Deletion cannot be undone, so export what you need first.",
        ]} />
      </S>

      <S id="copy" t="4. Copy forward to next year">
        <p>For a recurring client, click the copy icon on the client's row. The app creates a new engagement for the next financial year with the same team and company profile.</p>
        <Ul items={[
          "Choose whether to carry over the entries made in the working papers and the documents already created.",
          "Every working paper starts again as Draft with no sign-offs, so the new year is reviewed afresh. The old year is left untouched.",
          "Carried-over text and figures are last year's; update them, and check dates in the documents.",
        ]} />
      </S>

      <S id="wp" t="5. Working papers">
        <Ul items={[
          "Open an engagement to see the list of 78 ICAI working-paper units, grouped by chapter. Use the search and status filters to find a paper; Open items shows papers that still contain placeholders.",
          "Open a paper to fill it in. Client name, task and period are pre-filled. Fill the white cells and text in place; placeholders such as XX, XYZ and ..... are highlighted until you replace them.",
          "Save as you go. Export a single paper to Word or PDF, or use Export all to download every paper of the engagement as a zip.",
          "PDF export needs Microsoft Word or LibreOffice installed on the computer. Word export always works.",
        ]} />
      </S>

      <S id="sign" t="6. Sign-offs and locking">
        <p>Each paper moves through Draft, Prepared, Reviewed and Approved. Each stage is signed by a person from the engagement team with their initials and the date and time.</p>
        <Ul items={[
          "A signed paper is locked and cannot be edited.",
          "The same person cannot prepare and review unless 'Allow the same person to prepare and review' is ticked in the engagement settings (useful for small teams).",
          "Re-open a locked paper by giving a reason. Earlier sign-offs are cleared and the reason is recorded.",
          "Every save, sign-off, re-opening, export and document action is written to the engagement's Log.",
        ]} />
      </S>

      <S id="prof" t="7. Company profile and import">
        <p>Open an engagement, then Documents, then Company profile. Enter the client's CIN, PAN, registered office, capital, directors and shareholders once. All documents for that client are pre-filled from it.</p>
        <Ul items={["Add or remove directors and shareholders with the buttons on each table. Share totals and percentages are calculated automatically.", "Import Excel / CSV fills the directors or shareholders table from a file (.xlsx or .csv). The first row must be headings; a Name column is required. Download Sample file to see the layout. Other columns: DIN, Designation, Category, Date of appointment (YYYY-MM-DD), Address for directors; Address, Shares, Face value for shareholders.", "If a table already has rows, the app asks whether to replace them or add to them.", "If you keep the register in Tally, export it to Excel from Tally and import that file; the app does not read Tally directly.", "Clear all fields empties the whole page; nothing is saved until you press Save profile."]} />
      </S>

      <S id="docs" t="8. Documents">
        <p>Under Documents, choose a template and click Create. Available templates: engagement letter, management representation letters (clause-based and CARO), auditor's consent and eligibility certificate, appointment letter, list of directors, list of shareholders, MBP-1 and DIR-8, board resolution on financial statements, turnover certificate, net worth certificate and proposal to client.</p>
        <Ol items={[
          "Check the fields at the top; details from the engagement, Company profile and Firm settings are already filled.",
          "For the proposal and the clause-based representation letter, tick the clauses that apply to this client and edit the wording in the boxes. Add a clause with Add clause. Changes affect only this document.",
          "Click Preview to see the document as it will print beside the form; Refresh updates it after you change something. Preview and PDF need LibreOffice or Microsoft Word.",
          "Save, then export to Word (editable) or PDF. Before exporting, the app warns if any '---------' blank is still in the document and lists where.",
          "Email saves the Word file in your Downloads folder and opens a new email with the subject and message ready; attach the saved file yourself (Windows does not allow a program to attach files automatically).",
        ]} />
        <p>Clear fields in the document editor empties the typed fields (ticked clauses are kept). Reload from library replaces the clauses with the current library. Several documents of the same type can be made for one client.</p>
        <p className="text-muted-foreground">Unfilled details appear as "---------" in the output so they are easy to find before the document is sent. Always read the exported document before issue.</p>
      </S>

      <S id="pack" t="9. Document packs, zip and combined PDF">
        <Ul items={[
          "Document pack (top right of Documents): tick the documents you need and the app creates them all at once, pre-filled. Tick 'one MBP-1 / DIR-8 for every director' to create one per director in the Company profile. The usual appointment set is ticked by default.",
          "Under Created documents, tick the documents you want (or tick none for all) and choose Word (zip), PDF (zip) or One combined PDF.",
          "One combined PDF joins the chosen documents in the order of the list and numbers the pages 'Page 1 of N'. It needs the pypdf and reportlab libraries, which the launcher installs automatically.",
          "After creating a pack, open each document and check it before issue.",
        ]} />
      </S>

      <S id="clause" t="10. Clause library">
        <p>The Clause library holds the firm's standard wording for proposals and representation letters, so documents are not built from an old client's text.</p>
        <Ul items={[
          "Choose the Proposal or Management representation letter tab. Each box is one clause; the tick says whether it is included by default in new documents.",
          "Edit wording, add clauses or headings, and delete what you do not use. Use '---------' where client-specific detail should be filled in. An optional bold lead-in can be added to a clause.",
          "Press Save library. Restore standard brings back the wording supplied with the app.",
          "Library changes apply to documents created afterwards; existing documents keep their own copy.",
        ]} />
      </S>

      <S id="firm" t="11. Firm settings">
        <p>Firm name, FRN, PAN, address, place, tagline, contact line and partners. Partners listed here appear in the signatory drop-downs. Untick 'Print a text letterhead' if the firm uses pre-printed stationery. The optional logo appears at the top of the app only; it is not printed on documents.</p>
      </S>

      <S id="find" t="12. Search">
        <p>Type at least two letters in the search box at the top left and press Enter. The results list matching clients (name, nature of engagement or CIN) and matching documents (name, type or client). Click a result to open it.</p>
      </S>

      <S id="look" t="13. Appearance">
        <p>Use Dark mode in the left panel, or Settings &amp; backup to choose light or dark and one of five accent colours. The choice is remembered on this computer. Working papers still show as white paper so that they look like the printed copy.</p>
      </S>

      <S id="data" t="14. Backup, restore and password">
        <Ul items={[
          "Settings & backup, Download backup: saves one .zip with everything (clients, papers, documents, firm settings, clause library). Do this regularly and keep a copy on a pen drive.",
          "Restore from backup: replaces everything with the contents of a backup file. The data it replaces is kept as workpapers.before-restore.db in the data folder.",
          "App password: optional; the app then asks for it each time it is opened. Forgotten password: close the app, create an empty file named reset-lock.txt in the data folder, start the app again and set a new password. Your data is not affected.",
          "All data is stored on this computer in the folder %LOCALAPPDATA%\\WorkPaperPro (type it in File Explorer's address bar). The database file is workpapers.db.",
          "To back up, close the app and copy that folder. To move to another computer, copy it to the same place there.",
          "The app only accepts connections from this computer.",
        ]} />
      </S>

      <S id="fix" t="15. Troubleshooting">
        <Ul items={[
          "The window does not open: look at launcher.log in the data folder. If another program uses port 8765, close it.",
          "'No module named ...' when running from Python: run  pip install fastapi uvicorn lxml docx2pdf pypdf reportlab  in Command Prompt. The launcher also tries to install missing packages by itself on first run.",
          "PDF export, preview or combined PDF fails: install LibreOffice (free) or use Microsoft Word, or export to Word and save as PDF from there. Settings & backup shows which PDF engine was found.",
          "Import says no Name column: the first row must contain headings such as Name, DIN, Shares. Use the Sample file.",
          "Combined PDF says a library is missing: run  pip install pypdf reportlab  and try again.",
          "A document shows '---------': that detail was left blank; fill it in the editor and export again.",
        ]} />
      </S>
      <S id="tips" t="16. Good practice">
        <Ul items={[
          "Fill Firm settings and the Clause library before the first client, then the Company profile for each client; the documents then need very little typing.",
          "Always read an exported document in full before it is issued. The app fills the details; the professional judgement remains yours.",
          "Make a backup at the end of every working day during busy periods, and keep a copy off this computer.",
          "Use Copy forward at the start of each year instead of starting a recurring client from nothing.",
          "Keep Windows itself protected with a login password; the app password is an additional layer.",
        ]} />
      </S>
    </main>
  );
}
