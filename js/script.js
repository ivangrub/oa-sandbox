//javascript document

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

  //add in journal name filters
  if ($("input[name='jrnlpub']:checked").length > 0) {
    var journalfilter = " AND (";
    $("input[name='jrnlpub']:checked").each(function(index) {
      journalfilter = journalfilter + "\"" + $(this).val() + "\"" + "[Jour] OR ";
    });
    journalfilter = journalfilter.substring(0, journalfilter.length - 4);
    journalfilter = journalfilter + ")";

    searchUrl = searchUrl + journalfilter;
  }

  if ($("input[type='radio']:checked").val() === "full_only") {
    searchUrl = searchUrl + " AND \"open access\"[filter]";
  }

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

      var pmcUrl = "http%3A%2F%2Feutils.ncbi.nlm.nih.gov%2Fentrez%2Feutils%2Fefetch.fcgi%3Fdb%3Dpmc%26id%3D" + pmcId.replace('PMC',"")

      var result = $("<li>")
      .append(
        $("<h4>").append($("<a>").attr("href", "lens/?url=" + pmcUrl).attr("target", "_blank").text(title))
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