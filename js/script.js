//javascript document

var pubmedSearchGlobals = { 
  urlBase : "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc",
  dataUrlBase : "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=",
  resultsPerPage : 10,
  minDate : 1809,
  maxDate : new Date().getFullYear(),
}

function PubmedRequest(params) {
  var obj = {};
  
  var defaults = {
    query : false,
    minDate : false,
    maxDate : false,
    oaOnly : false
  }
  obj.params = params;
  for ( option in defaults ) {
    if ( typeof obj.params[option] === 'undefined' ) {
      obj.params[option] = defaults[option];
    }
  }
  obj.journalList = JournalList();
  obj.response = false;
  obj.url = '';

  obj.buildSearchUrl = function() {
    //builds the url from the search parameters
    if (!this.params.query) return false;
    var url = pubmedSearchGlobals.urlBase + '&term=' + obj.params.query;
    //add journal filters if necessary
    if (this.journalList.activeJournals) {
      var journalFilter = " AND (";
      for (index in this.journalList.activeJournals) {
        journalFilter += '"' + this.journalList.activeJournals[index] + '"[Jour] OR ';
      }
      journalFilter = journalFilter.substring(0, journalFilter.length - 4);
      journalFilter += ")";
      url += journalFilter;
    }
    //add OA filter if necessary
    if (this.params.oaOnly) {
      url += ' AND "open access"[filter]';
    } else if (this.params.minDate || this.params.maxDate) {
      //add date filters if necessary
      //note: there appears to be a bug in the PMC search in which NO results are returned
      //when both the open access filter and the date are set. Therefore, we will only
      //apply the date filters if OA filters are off.
      if (!this.params.minDate) this.params.minDate = pubmedSearchGlobals.minDate;
      if (!this.params.maxDate) this.params.maxDate = pubmedSearchGlobals.maxDate;
      url += '&datetype=pdat&mindate=' + this.params.minDate + '&maxdate=' + this.params.maxDate;
    }
    url = encodeURI(url);
    this.url = url;
    return url;
  }

  obj.buildFullSummaryUrl = function(eSearchResponse) {
    var numResults = $(eSearchResponse).find("eSearchResult > Count").text();
    if (!this.response) this.response = PubmedResponse(numResults);
    var pmcIds = $.map( $(eSearchResponse).find("IdList Id"), function(val, index) {
      return $(val).text();
    });
    var dataUrl =  pubmedSearchGlobals.dataUrlBase + pmcIds.join(",");
    return dataUrl;
  }

  obj.execute = function(pageNum) {
    //performs a pubmed search associated with a specific page of results (1 by default) 
    //creates a PubmedResponse if none exists
    //creates a new Page if needed
    //populates that Page with Results
    if (typeof pageNum === "undefined") pageNum = 1;
    var that = this;
    var retMax = pubmedSearchGlobals.resultsPerPage;
    var retStart = 0;
    var total = 0;
    console.log(this.journalList.activeJournals);
    var searchUrl = this.buildSearchUrl();
    console.log(searchUrl);
    var summaryUrl = '';
    var result = false;
    if (pageNum > 1) retStart = (pageNum - 1) * retMax;
    searchUrl += '&retmax=' + retMax + '&retstart=' + retStart;
    return $.get(searchUrl).then(function(eSearchResponse) {
      summaryUrl = that.buildFullSummaryUrl(eSearchResponse);
      if (!summaryUrl) return false;
      return $.get(summaryUrl).then(function(eSummaryResponse) {
        result = that.response.pages[pageNum] = Page();
        result.populate(eSummaryResponse, that);
        return result;
      });
    });
  }
  pubmedSearchGlobals.activeRequest = obj;
  return obj;
}

function PubmedResponse(totalResults) {
  var obj = {
    totalResults : parseInt(totalResults, 10),
    pages : []
  }
  obj.paginator = Paginator(totalResults);
  return obj;
}

function Page() {
  var obj = {
    results : [],
  }

  obj.populate = function(data, parentReq) {
    var that = this;
    $(data).find("eSummaryResult > DocSum").each(function(index, val) {
      var title = $(val).find("Item[Name='Title']").text();
      var authors = $.map($(val).find("Item[Name='AuthorList'] > Item"), function(val, index) {
        return $(val).text(); 
      }).join(", ");
      var pubDate = $(val).find("Item[Name='PubDate']").text();
      var ePubDate = $(val).find("Item[Name='EPubDate']").text();
      var source = $(val).find("Item[Name='Source']").text();
      // logic around displaying published date
      // 2011 November 17
      var published = "";
      if (ePubDate.length > 0) {
        // epubdate: 2013/09/30
        var date = new Date(ePubDate.substring(0, 4), ePubDate.substring(5, 7) - 1, ePubDate.substring(8, 10));
        date = $.format.date(date, "yyyy MMM d");
        published = date;
      } else if (pubDate.length > 0) {
        // pubdate: 2013 Oct 15
        published = pubDate;
      }
      var pmId = $(val).find("Item[Name='ArticleIds'] > Item[Name='pmid']").text();
      var pmcId = $(val).find("Item[Name='ArticleIds'] > Item[Name='pmcid']").text();
      var doi = $(val).find("Item[Name='ArticleIds'] > Item[Name='doi']").text();
      that.results.push(Result(authors, published, title, source, pmId, pmcId));
      parentReq.journalList.addToJournals(source);
    });
    return true;
  }
  return obj;
}

function Result(authors, year, title, journal, pmid, pmcid) {
  var obj = {
    authors : authors,
    year : year,
    title : title,
    journal : journal,
    pmid : pmid,
    pmcid : pmcid,
  }
  return obj;
}

function Paginator(totalResults) {
  var obj = {
    currentPage : 1,
    totalPages : 1,
    totalResults : totalResults
  }
  obj.resultsPerPage = pubmedSearchGlobals.resultsPerPage;
  //now that we know totalResults and resultsPerPage, we can calculate the number of pages
  if (totalResults) obj.totalPages = Math.ceil(totalResults / obj.resultsPerPage)

  obj.updatePage = function(page) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      return this.currentPage;
    } else {
      return false;
    }
  }

  obj.generateMessage = function() {
    var first, last;
    if (!this.totalResults) return 'No results found';
    if (this.currentPage == this.totalPages) last = this.totalResults;
    else last = this.currentPage * this.resultsPerPage;
    first = (this.currentPage - 1) * this.resultsPerPage + 1;
    return 'Showing results ' + first + '-' + last + ' of ' + this.totalResults;
  }
  return obj;
}

function JournalList() {
  var obj = {
    allJournals : [],
    activeJournals : []
  }
  obj.addToJournals = function(journalName) {
    //check for duplicates, add to allJournals if not already in there
    if (this.allJournals.indexOf(journalName) === -1) {
      this.allJournals.push(journalName);
      return true;
    } else {
      return false;
    }
  }
  obj.hasActive = function(journalName) {
    if (this.activeJournals.indexOf(journalName) === -1) return false;
    else return true;
  }
  obj.addToActive = function(journalName) {
    //check for duplicates, check that is IN in active list, add to activeJournals if not already in there
    if (this.activeJournals.indexOf(journalName) === -1 &&
        this.allJournals.indexOf(journalName) !== -1 ) {
      this.activeJournals.push(journalName);
      return true;
    } else {
      return false;
    }
  }
  obj.removeFromActive = function(journalName) {
    //remove the journal name from the list of active journals
    var index = this.activeJournals.indexOf(journalName);
    if (index !== -1) {
      var item = this.activeJournals.splice(index, 1);
      return item[0];
    } else {
      return false;
    }
  }
  return obj;
}

function routeNewRequest(query) {
  //add date filters if necessary
  var params = { query : query,
    minDate : $('input[name="date-begin"]').val(),
    maxDate : $('input[name="date-end"]').val()
  }
  //add open access filters if necessary
  params.oaOnly = true;
  var req = PubmedRequest(params);
  req.execute().done(function() {
    render(req, req.response);
  });
}

function modifyRequest($element) {
  if (!pubmedSearchGlobals.activeRequest) return false;
  var req = pubmedSearchGlobals.activeRequest;
  var name = $element.attr('name');
  var value = $element.val();
  //fresh search: destroy the response;
  req.response = false;
  switch(name) {
    case 'article_type':
      if (value == 'full_article') req.params.oaOnly = true;
      else req.params.oaOnly = false;
      break;
    case 'jrnlpub':
      if ($element.prop('checked')) req.journalList.addToActive(value);
      else req.journalList.removeFromActive($element.val());
      break;
  }
  req.execute().done(function() {
    render(req, req.response);
  });
}

function routeNewPage(pageNum) {
  if (!pubmedSearchGlobals.activeRequest) return false;
  var req = pubmedSearchGlobals.activeRequest;
  if (!req.response.paginator.updatePage(pageNum)) return false;
  if (typeof req.response.pages[pageNum] === 'undefined') {
    req.execute(pageNum).done(function() {
      render(req, req.response);
    });
  } else {
    render(req, req.response);
  }
}

function render(request, response) {
  var page = response.paginator.currentPage;
  var results = response.pages[page].results;
  var journals = request.journalList.allJournals;
  var resultTemplate = Handlebars.compile($('#result-template').html());
  var journalTemplate = Handlebars.compile($('#journal-template').html());
  $('#result-total').html(response.paginator.generateMessage());
  $('#pagination').bootstrapPaginator({
    bootstrapMajorVersion: 3,
    currentPage: response.paginator.currentPage,
    totalPages: response.paginator.totalPages,
    onPageClicked: function(e, originalEvent, type, page) {
      e.stopImmediatePropagation();
      routeNewPage(page);
    },
  });
  $('#result-list').html(resultTemplate({results:results}));
  $('#journal-list').html(journalTemplate({journals:journals}));
  $('#journal-list input').each(function() {
    if (request.journalList.hasActive($(this).val())) {
      $(this).prop('checked', true);
    }
  })
  $('.search-refresh').unbind().change(function() {
    modifyRequest( $(this) );
  });
}

//get GET variable by name
// got from http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
    var results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}


$( document ).ready(function() {  
  //on page load, get GET variable "query"
  var value = getParameterByName("query")
  if (value.length > 0) {
    $('#search').val(value);
    routeNewRequest(value);
  }
  $('#search-form').submit(function(event) {
    event.preventDefault();
    routeNewRequest( $('#search').val() );
  });
  $('.search-refresh').change(function() {
    modifyRequest( $(this) );
  });
});