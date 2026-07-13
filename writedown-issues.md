Feature Ideas
-----------------

See @sec-one.

- [ ] (a) Extract refs to *.bib file - put in scratch buffer.
- [x] (b) spell checker
- [ ] (c) variable width between the text editor and the preview/rendered view

***

Issues {#sec-one}
=====

- [x] (1) new project -> the (dev) features folder gets added in addition to the folder you add

- [x] (2) TAB heights: new file in preview mode (italics file name, single click on the file in folder/proj col)--> the tab does not pick up default size. It comes out very tall. When you edit it, it shrinks.

- [x] (3) quarto @sec-this-and-that tags appear as a missing reference. sec-, tbl- etc., the standard quarto labels should be all excluded from the tag ref regex. Note, my tags are almost always @ Author[0-9]{4}[a-z]*, but occasionally there are some just @ Authors. I almost always use - in my quarto section etc. tags.

- [x] (4) BIGGIE: in the rendered preview mode: is the pipeline to create a temp file version? We need to look for simple includes in the containing folder. eg my standard op proc is to have an img folder with images. We need ![](img/xxx) refs to work. Can we do that by linking the img (and other if appropriate) folders into the temp folder too - that's a quick move, largely just at start up.

- [x] (5) Can the Rendered tab revert to Preview automatically if there is no render available?

- [x] (6) Folder = not acting like a folder now we have proj, it should just be a file explorer, right? Just shows open-able files.

- [x] (7) Split between preview and editor window re-sizeable?

### July 12 punch ups

- [ ] (1) save projects under ~/.writedown/projects - and list provide quick switch projects etc. User should not be asked about where to save projects - that is  all managed. 
- [ ] (2) new file -> lose spot in files/projects (dir list folds up); ditto delete me etc. investigate file ops and folder/project tree interaction. 
- [ ] (3) text wrap on / off in editor window (see (4) too)  
- [ ] (4) other ST key mappings (Ctrl K + Ctrl W toggle wrap, Ctrl +K kill to end of line, make Ctrl + B **xxx** (and Ctrl + I for italics); remap build to Ctrl+Shift + B; help shows list of key bindings;
- [ ] (5) spell checker on/off; add word; ignore word (??not working)
- [ ] (6) table format - add ST ctrl + alt + shft + T as shortcut (strong muscle memory) 
- [ ] (7)
- [ ] (8)

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
![caption](C:/tmp/cypriot_medium.jpg){width=50%}

![caption2](../../../../tmp/cypriot_medium.jpg){width=25% #fig-cyp}

<!-- need to escape the backslash -->
![caption3](..\\..\\..\\..\tmp\cypriot_medium.jpg){width=5%}


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

