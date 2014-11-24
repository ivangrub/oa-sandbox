describe("PubmedRequest", function() {
  var req;
  var url;

  describe("buildFullUrl", function() {

    it("should formulate a valid url when passed a query", function() {
      req = PubmedRequest({ query: "rose md" });
    });
    it("should formulate a valid url when passed a query and a date range", function() {
      req = PubmedRequest({ query: "rose md", minDate: 1990, maxDate : 2000});
    });
    it("should formulate a valid url when passed a query and some journals", function() {
      req = PubmedRequest({ query: "rose md", journals: ['J Cell Biol', 'Mol Biol Cell']});
    });    
    it("should formulate a valid url when passed a query and a OA-Only is turned on", function() {
      req = PubmedRequest({ query: "rose md", oaOnly: true });
    });
    it("should formulate a valid url when all parameters are set", function() {
      req = PubmedRequest({ 
        query: "goode bl", 
        minDate : 2013, 
        maxDate : 2014, 
        journals: ['eLife', 'J Cell Biol', 'Mol Biol Cell'],
        oaOnly: true
      });
    });

    afterEach(function() {      
      url = req.buildFullUrl();
      expect(url).toMatch(/^(ht|f)tps?:\/\/[a-z0-9-\.]+\.[a-z]{2,4}\/?([^\s<>\#"\,\{\}\\|\\\^\[\]`]+)?$/);
    })
  });

  describe("buildFullUrl should fail when", function() {

    it("the query is not set", function() {
      req = PubmedRequest({});
      url = req.buildFullUrl();
      expect(url).toBeFalsy();
    });

  });

});

describe("Page", function() {

})

describe("Paginator", function() {
  var paginator;
  var num;
  var bigNum;

  for (x = 0; x < 100; x++) { //run these tests 100 times
    num = Math.ceil( Math.random() * 10 ); //number between 1 and 10
    it("should contain a single page when the number of results is "+num, function() {
      paginator = Paginator(num);
      expect(paginator.totalPages).toBe(1);
    });
    bigNum = Math.ceil( Math.random() * 50 ) + 10 //number between 11 and 100
    it("should contain multiple pages when the number of results is "+bigNum, function() {
      paginator = Paginator(bigNum);
      expect(paginator.totalPages).toBeGreaterThan(1);
    });
  }
  it("should contain a single page when no results are returned", function() {
    paginator = Paginator(0);
    expect(paginator.totalPages).toBe(1);
  })

  describe("updatePage", function() {

    beforeEach(function() {
      paginator = Paginator(50); //set up a paginator with 50 results (5 pages)
    });
    it("should return false if the page is set to 0", function() {
      var result = paginator.updatePage(0);
      expect(result).toBeFalsy();
      expect(paginator.currentPage).toBe(1);
    })
    it("should return false if the page is set to a number greater than the total number of pages", function() {
      var result = paginator.updatePage(6);
      expect(result).toBeFalsy();
      expect(paginator.currentPage).toBe(1);
    })
    it("should be able to set the current page", function() {
      var newPage = 3;
      var result = paginator.updatePage(newPage);
      expect(result).toBe(newPage);
      expect(paginator.currentPage).toBe(newPage);
    });
    it("should return false if the new page is the same as the current page", function() {
      var newPage = 1;
      var result = paginator.updatePage(newPage);
      expect(result).toBe(1);
      expect(paginator.currentPage).toBe(1);
    });
  });
});

describe("JournalList", function() {
  var jList;
  beforeEach(function() {
    jList = JournalList();
    jList.addToJournals('Nature');
    jList.addToJournals('Science');
    jList.addToJournals('Cell');
  });
  
  it("should contain 3 journals", function() {
    expect(jList.allJournals.length).toBe(3);
  });

  describe("addToJournals", function() {

    it("should add to to the list when passed a new journal", function() {
      var result = jList.addToJournals('J Cell Biol');
      expect(result).toBeTruthy();
      expect(jList.allJournals.length).toBe(4);
    })
    it("should not add to the list when passed a journal already in the list", function() {
      var result = jList.addToJournals('Nature');
      expect(result).toBeFalsy();
      expect(jList.allJournals.length).toBe(3);
    });

  });

  describe("addToActive", function() {

    it("should be able to add a journal to the active journals list", function() {
      var result = jList.addToActive('Nature');
      expect(result).toBeTruthy();
      expect(jList.activeJournals.length).toBe(1);
    });
    it("should do nothing if the new journal is not in allJournals", function() {
      var result = jList.addToActive('J Cell Biol');
      expect(result).toBeFalsy();
      expect(jList.activeJournals.length).toBe(0);
    });

  });

  describe("removeFromActive", function() {
    beforeEach(function() {
      jList.addToJournals('J Cell Biol');
      jList.addToActive('J Cell Biol');
    });

    it("should be able to remove a journal from the active journals list", function() {
      var result = jList.removeFromActive('J Cell Biol');
      expect(result).toBe('J Cell Biol');
      expect(jList.activeJournals.length).toBe(0);
    });
    it("should do nothing if the journal is not in the active journals list", function() {
      var result = jList.removeFromActive('Mol Biol Cell');
      expect(result).toBe(false);
      expect(jList.activeJournals.length).toBe(1);
    });
  });

});

