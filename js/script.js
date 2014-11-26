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
    journals : false,
    oaOnly : false
  }
  obj.params = params;
  for ( option in defaults ) {
    if ( typeof obj.params[option] === 'undefined' ) {
      obj.params[option] = defaults[option];
    }
  }
  obj.response = false;
  obj.url = '';

  obj.buildSearchUrl = function() {
    //builds the url from the search parameters
    if (!this.params.query) return false;
    var url = pubmedSearchGlobals.urlBase + '&term=' + obj.params.query;
    //add journal filters if necessary
    if (this.params.journals) {
      var journalFilter = " AND (";
      for (index in this.params.journals) {
        journalFilter += '"' + this.params.journals[index] + '"[Jour] OR ';
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
    //replace backslash chars with + to create a valid url
    //url = url.replace(/\s+/g, '+');
    //url = url.replace(/\(/g, '&28'))
    url = encodeURI(url);
    this.url = url;
    return url;
  }

  obj.buildFullSummaryUrl = function(eSearchResponse) {
    var numResults = $(eSearchResponse).find("eSearchResult > Count").text();
    if (!numResults) return false;
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
    var searchUrl = this.buildSearchUrl();
    var summaryUrl = '';
    var result = false;
    if (pageNum > 1) retStart = (pageNum - 1) * retMax;
    searchUrl += '&retmax=' + retMax + '&retstart=' + retStart;
    return $.get(searchUrl).then(function(eSearchResponse) {
      summaryUrl = that.buildFullSummaryUrl(eSearchResponse);
      if (!summaryUrl) return false;
      return $.get(summaryUrl).then(function(eSummaryResponse) {
        result = that.response.pages[pageNum] = Page();
        result.populate(eSummaryResponse);
        return result;
      });
    });
  }
  return obj;
}

function PubmedResponse(totalResults) {
  var obj = {
    totalResults : parseInt(totalResults, 10),
    pages : []
  }
  obj.paginator = Paginator(totalResults);
  obj.journalList = JournalList();
  return obj;
}

function Page() {
  var obj = {
    results : [],
  }

  obj.populate = function(data) {
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
    console.log(journalName, index);
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
  //add in journal name filters if necessary
  if ($("input[name='jrnlpub']:checked").length > 0) {
    var journals = [];
    $("input[name='jrnlpub']:checked").each(function(index) {
      journals.push( $(this).val() );
    });
  }
  //add open access filters if necessary
  if ($("input[type='radio']:checked").val() === "full_only") {
    params.oaOnly = true;
  }
  var req = PubmedRequest(params);
  req.execute().done(function() {
    console.log(req);
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
/*
$( document ).ready(function() {  
  	//on page load, get GET variable "query"
  	var value = getParameterByName("query")
  	if (value.length > 0) {
    	$('#search').val(value);
    	search(value);
  	}
  	$('#search-form').submit(function(event) {
    	event.preventDefault();
    	search( $('#search').val() );
  	});
  	$('.search-refresh').change(function() {
    	callPMC(window.searchStr, 1);
  	});
});
*/
function search(searchStr) {
  window.searchStr = searchStr;
  //set the journals list to an empty array
  window.jList = [];
  $('#journal-list').html('');
  //call PubMed and get results, starting at page 1
  callPMC(searchStr, 1);  
}

function switchPage(pageNum) {
  callPMC(window.searchStr, pageNum);
}

function callPMC(queryTerm, currentPage) {

  var retmax = 10;
    // get the start. 
  var retstart = (currentPage - 1) * retmax;
  
  var searchUrl = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc";
  searchUrl = searchUrl + "&retmax=" + retmax + "&retstart=" + retstart;
  searchUrl = searchUrl + "&term=" + queryTerm ;

	//add date filters if necessary
	minDate = $('input[name="date-begin"]').val();
	maxDate = $('input[name="date-end"]').val();
	if ( minDate !== "" && maxDate !== "" ) {
		searchUrl += "&datetype=pdat&mindate=" + minDate + "&maxdate=" + maxDate;
	} else if ( maxDate !== "" ) {
		//include a default mindate of 1809 since mindate and maxdate must be used in pairs
		searchUrl += "&datetype=pdat&mindate=1809&maxdate=" + maxDate
	} else if ( minDate !== "" ) {
		//get the current year
		currentYear = new Date().getFullYear();
		searchUrl += "&datetype=pdat&mindate=" + minDate + "&maxdate=" + currentYear
	}

  //add in journal name filters if necessary
  if ($("input[name='jrnlpub']:checked").length > 0) {
    var journalfilter = " AND (";
    $("input[name='jrnlpub']:checked").each(function(index) {
      journalfilter = journalfilter + "\"" + $(this).val() + "\"" + "[Jour] OR ";
    });
    journalfilter = journalfilter.substring(0, journalfilter.length - 4);
    journalfilter = journalfilter + ")";

    searchUrl = searchUrl + journalfilter;
  }

	//add open access filters if necessary
  if ($("input[type='radio']:checked").val() === "full_only") {
    searchUrl = searchUrl + " AND \"open access\"[filter]";
  }
	
	console.log(searchUrl);

  //send off the request
  var request = $.get(searchUrl);
  
  //process the data returned by PubMed
  var chained = request.then(function(data) {
    var total = $(data).find("eSearchResult > Count").text();

	  //display result-total and pagination
    if (total == 0) {
      $("#result-total").text("Your query found no results");
      $('.pagination').html('');
      return;
    } else if (total < 10) {
      $('#result-total').text("Showing results 1 - " + total);
      $('.pagination').html('');
    } else {
      //multiple pages of results
      //change #result-total
      if ( currentPage * retmax < total) {	
      	$("#result-total").text("Showing results " + (((currentPage - 1) * retmax) + 1) + "-" + (currentPage * retmax) + " of " + total + " results");
	  } else {
	  	//last page
	  	$("#result-total").text("Showing results " + (((currentPage - 1) * retmax) + 1) + "-" + total + " of " + total + " results");
	  }
      //now deal with the pagination
      //how many pages of results do we need?
      var totalPages = (total / retmax);
      if (total % retmax > 0) {
        totalPages = totalPages + 1;
      }
      //now change .pagination
      var options = {
      	bootstrapMajorVersion: 3,
        currentPage: currentPage,
        totalPages: totalPages,
        onPageClicked: function(e, originalEvent, type, page) {
          e.stopImmediatePropagation();
          switchPage(page);
        },
        
      };
      $('#pagination').bootstrapPaginator(options);
    }

    var pmcIds = $.map($(data).find("IdList Id"), function(val, index) {
      return $(val).text();
    });
    
    var metadataUrl = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=" + pmcIds.join(",");
    return $.get(metadataUrl);
  });

  chained.done(function(data) {
    $("#result-list").empty();

    $(data).find("eSummaryResult > DocSum").each(function(index, val) {
      var title = $(val).find("Item[Name='Title']").text();
      var authors = $.map($(val).find("Item[Name='AuthorList'] > Item"), function(val, index) {
        return $(val).text(); 
      }).join(", ");

      var pubDate = $(val).find("Item[Name='PubDate']").text();
      var ePubDate = $(val).find("Item[Name='EPubDate']").text();
      
      var source = $(val).find("Item[Name='Source']").text();
      
      //check if the source (journal) is in the journals list
      if (window.jList.indexOf(source) === -1) {
        window.jList.push(source);
        //append item like
        //<li class="search-refresh"><label class="checkbox"><input type="checkbox" name="jrnlpub" value="eLife"/>eLife</label></li>
        //to journal-list
        var newJournal = $('<li class="search-refresh">').append(
          $('<label class="checkbox">').append(
            $('<input type="checkbox" name="jrnlpub">').attr('value', source).change(function () {
              callPMC(window.searchStr, 1);
            })
          ).append(source)
        );
        $('#journal-list').append(newJournal);
      }

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

      console.log(doi);

      var result = $("<li>")
      .append(
        $("<h4>").append($("<a>").attr("href", "lens/?id=" + pmcId).attr("target", "_blank").text(title))
      )
      .append(
        $("<p>")
        .append(authors)
        .append($("<br>"))
        .append($("<i>").append(source))
        .append(".&nbsp;&nbsp;")
        .append(published)
      );

      $("#result-list").append(result);

    });

    // until we figure out what should be in focus after the search result is rendered, 
    // don't focus on anything
    $("#search").blur();
  });
}