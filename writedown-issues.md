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

- [ ] (4) BIGGIE: in the rendered preview mode: is the pipeline to create a temp file version? We need to look for simple includes in the containing folder. eg my standard op proc is to have an img folder with images. We need ![](img/xxx) refs to work. Can we do that by linking the img (and other if appropriate) folders into the temp folder too - that's a quick move, largely just at start up.

- [x] (5) Can the Rendered tab revert to Preview automatically if there is no render available?

- [ ] (6) Folder = not acting like a folder now we have proj, it should just be a file explorer, right? Just shows open-able files.

- [ ] (7) Split between preview and editor window re-sizeable?

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

