Feature Ideas
===============
 
## July 14 Round 2

- [ ] (1) Min length of word for spell check = 4 / where is the list of ignored words? add all file extensions!  
 
## July 14 bugs, punchups, and features 

### Bugs / Punchups 
- [x] (1) save on lost focus = when you move off the tab onto folder or project it does not save ATM. it should
- [ ] (2) change folder results in projects being reset? - the folder and projects should be independent --> seems to still be an issue 
- [x] (3) do **not** filter dot files! (eg in users\steve\.writedown should be visible in the tree view)
- [x] (4) @ REEYYYY defeated by trailing period, colon punctuation (comma, semicolon ok) - adjust regex. @Mildenhall2022a.
- [x] (6) spell check should ignore words in all caps. it DOESE already, doese. 

ABUCRK abucrk 

### Questions 
- [ ] (5) what happens when you have multiple instances of the exe running?
- [ ] (e) what is the universe of ST commands available?
- [ ] (f) Project save file location: this should be completely managed - user never asked where to save a project. I don't think that is the case right now.  User should not be asked about where to save projects. Quick switch projects discovers those in saved location. What does palette -> save project as do? It should just rename (no file dialog box)? 
- [ ] (g) when we iterate on code, an I keep the old compiled exe open and use it - and iterate on a tauri dev instance?

### Features 
- [x] (a) FEATURE: Extract refs in qmd / md file to *.bib file - put in a new scratch buffer.
- [x] (d) FEATURE: insert date time function on palette YYYY-MM-DD HH:MM:SS format. 2026-07-14 16:45:25 
- [x] FEATURE: Use csv-grid for csv preview - load with fzf and column headers and resize, and copy/export buttons (see C:/s/AI/csv-viewer).
- [x] (4) FEATURE: add Ctrl+Shift+Q -> quick open a file. Default for me is the writedown bug reporter:  \s\ai\writedown\writedown-issues.md (my bug reporter). Customize location in config. 

Past Issues {#sec-one}
================

- [x] (1) new project -> the (dev) features folder gets added in addition to the folder you add

- [x] (2) TAB heights: new file in preview mode (italics file name, single click on the file in folder/proj col)--> the tab does not pick up default size. It comes out very tall. When you edit it, it shrinks.

- [x] (3) quarto @sec-this-and-that tags appear as a missing reference. sec-, tbl- etc., the standard quarto labels should be all excluded from the tag ref regex. Note, my tags are almost always @ Author[0-9]{4}[a-z]*, but occasionally there are some just @ Authors. I almost always use - in my quarto section etc. tags.

- [x] (4) BIGGIE: in the rendered preview mode: is the pipeline to create a temp file version? We need to look for simple includes in the containing folder. eg my standard op proc is to have an img folder with images. We need ![](img/xxx) refs to work. Can we do that by linking the img (and other if appropriate) folders into the temp folder too - that's a quick move, largely just at start up.

- [x] (5) Can the Rendered tab revert to Preview automatically if there is no render available?

- [x] (6) Folder = not acting like a folder now we have proj, it should just be a file explorer, right? Just shows open-able files.

- [x] (7) Split between preview and editor window re-sizeable?

### July 12 punch ups

*I think these are all done*

- [ ] (2) new file -> lose spot in files/projects (dir list folds up); ditto delete me etc. investigate file ops and folder/project tree interaction. 
- [x] (3) text wrap on / off in editor window (see (4) too)  
- [x] (4) other ST key mappings (Ctrl K + Ctrl W toggle wrap, Ctrl +K kill to end of line, make Ctrl + B **xxx** (and Ctrl + I for italics); remap build to Ctrl+Shift + B; help shows list of key bindings;
- [ ] (5) spell checker on/off; add word; ignore word (??not working)
- [x] (6) table format - add ST ctrl + alt + shft + T as shortcut (strong muscle memory) 


### Too hard - pend 

- [ ] (8) Add R support

***

see @sec-one and @Mildenhall2022a.

````{mermaid}
sequenceDiagram
    Browser->>Flask: GET /dashboard
    Flask->>Data: Load CSV files
    Data-->>Flask: Transactions
    Flask-->>Browser: Rendered page
````

<!-- remember this is deleted each evening!  -->
![caption Space 20](C:/s/Photos/Headshots/roman%20med.jpg){width=10%}

![caption A](C:/s/Photos/Headshots/roman%20med.jpg){width=50%}

![caption B](C:\s\Photos\Headshots\roman_med.jpg){width=35%}

![caption C](C:/s/Photos/Headshots/roman_med.jpg){width=25%  #fig-cyp}

![caption D](/s/Photos/Headshots/roman_med.jpg){width=25%  #fig-cyp2}

![caption E](c:\\s\\Photos\\Headshots\\roman_med.jpg){width=25%  #fig-cyp3}


<!-- need to escape the backslash 
![caption2](../../../../tmp/cypriot_medium.jpg){width=25%}
![caption3](..\\..\\..\\..\tmp\cypriot_medium.jpg){width=5%}
-->


```{python}
f = lambda x: x ==0 or x * f(x-1)
x = f(59)
print(len(str(x)), x)
```

| A                          |                     B |      C      |
| :------------------------- | --------------------: | :---------: |
| asfd asdfasdfasdfasdf jasd |                     a |     tab     |
| asfd jasd                  | asdfa askdfj ;lasd jf |     tab     |
| asfd jasd asdfasdf         |                     a | tab asdfasd |

