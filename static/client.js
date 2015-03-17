function decodeQuery() {
  var query = location.search.substr(1);
  var result = {};
  query.split("&").forEach(function(part) {
    var item = part.split("=");
    result[item[0]] = decodeURIComponent(item[1]);
  });
  return result;
}

$(function () {
  var board, chess = new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), request, cache = {};

  var $info = $('#info');
  var $status = $('#status');
  var $winning = $('#winning');
  var $drawing = $('#drawing');
  var $losing = $('#losing');

  function handleMoveMouseEnter(event) {
    var uci = $(this).attr('data-uci');
    $('#board .square-' + uci.substr(0, 2)).css('box-shadow', 'inset 0 0 3px 3px yellow');
    $('#board .square-' + uci.substr(2, 2)).css('box-shadow', 'inset 0 0 3px 3px yellow');
  }

  function handleMoveMouseLeave(event) {
    var uci = $(this).attr('data-uci');
    $('#board .square-' + uci.substr(0, 2)).css('box-shadow', '');
    $('#board .square-' + uci.substr(2, 2)).css('box-shadow', '');
  }

  function handleMoveClick(event) {
    event.preventDefault();
    var fen = $(this).attr('data-fen');
    var uci = $(this).attr('data-uci');
    $btn_white.toggleClass('active', fen.indexOf(' w ') > -1);
    $btn_black.toggleClass('active', fen.indexOf(' w ') == -1);
    $fen.val(fen);
    board.position(fen);
    chess.load(fen);
    probe(fen, true);
    $('#board .square-' + uci.substr(0, 2)).css('box-shadow', '');
    $('#board .square-' + uci.substr(2, 2)).css('box-shadow', '');
  }

  function handleProbeError(statusCode, textStatus) {
    if (statusCode == 0) {
      // Request cancelled.
      $status.text('Request cancelled');
      $info.empty();
      return;
    } else if (statusCode == 400) {
      // Invalid FEN or position.
      $status.text('Invalid position').removeClass('black-win').removeClass('white-win');
      $info.html('<p>The given position is not a legal chess position.</p>');
    } else {
      // Network error.
      $status.text('Network error').removeClass('black-win').removeClass('white-win');
      $info
        .text('Request failed: ' + textStatus)
        .append('<div class="reload"><a class="btn btn-default" href="/?fen=' + chess.fen() + '">Try again</a></div>');
    }
  }

  function handleProbeSuccess(tmpChess, data) {
    var fen = tmpChess.fen();

    // If the game is over this has already been handled.
    if (tmpChess.game_over()) {
      $info.children('.spinner').remove();
      return;
    }

    if (fen == 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
      // Pass. Chess is not solved yet.
      $info.children('.spinner').remove();
    } else if (data.wdl === null) {
      $status.text('Position not found in tablebases').removeClass('black-win').removeClass('white-win');
      $info.html('<p>Syzygy tables only provide information for positions with up to 6 pieces and no castling rights.</p>');
    } else if (data.dtz === 0) {
      $status.text('Tablebase draw').removeClass('black-win').removeClass('white-win');
      $info.empty();
    } else if (tmpChess.turn() == 'w') {
      if (data.dtz > 0) {
        $status.text('White is winning with DTZ ' + data.dtz).removeClass('black-win').addClass('white-win');
      } else {
        $status.text('White is losing with DTZ ' + Math.abs(data.dtz)).removeClass('white-win').addClass('black-win');
      }
      $info.empty();
    } else {
      if (data.dtz > 0) {
        $status.text('Black is winning with DTZ ' + data.dtz).removeClass('white-win').addClass('black-win');
      } else {
        $status.text('Black is losing with DTZ ' + Math.abs(data.dtz)).removeClass('black-win').addClass('white-win');
      }
      $info.empty();
    }

    if (data.wdl == -1) {
      $info.html('<p><strong>This is a blessed loss.</strong> Mate can be forced, but a draw can be achieved under the fifty-move rule.</p>');
    } else if (data.wdl == 1) {
      $info.html('<p><strong>This is a cursed win.</strong> Mate can be forced, but a draw can be achieved under the fifty-move rule.</p>');
    }

    var moves = [];
    for (var uci in data.moves) {
      if (data.moves.hasOwnProperty(uci)) {
        var moveInfo;
        if (uci.length == 5) {
          moveInfo = tmpChess.move({
            from: uci.substr(0, 2),
            to: uci.substr(2, 2),
            promotion: uci[4]
          });
        } else {
          moveInfo = tmpChess.move({
            from: uci.substr(0, 2),
            to: uci.substr(2, 2)
          });
        }

        var checkmate = tmpChess.in_checkmate();
        var stalemate = tmpChess.in_stalemate();
        var insufficient_material = tmpChess.insufficient_material();
        var dtz = data.moves[uci];

        var moveFen = tmpChess.fen();
        var parts = moveFen.split(/ /);
        var halfMoves = parseInt(parts[4], 10);
        parts[4] = '0';
        parts[5] = '1';
        moveFen = parts.join(' ');

        moves.push({
          uci: uci,
          san: moveInfo.san,
          checkmate: checkmate,
          stalemate: stalemate,
          insufficient_material: insufficient_material,
          dtz: dtz,
          winning: (dtz !== null && dtz < 0) || checkmate,
          drawing: stalemate || insufficient_material || (dtz === 0 || (dtz === null && data.wdl !== null && data.wdl < 0)),
          zeroing: halfMoves === 0,
          fen: moveFen
        });

        tmpChess.undo();
      }
    }

    moves.sort(function (a, b) {
      // Compare by definite win.
      if (a.checkmate && !b.checkmate) {
        return -1;
      } else if (!a.checkmate && b.checkmate) {
        return 1;
      }

      // Compare by stalemate.
      if (a.stalemate && !b.stalemate) {
        return -1;
      } else if (!a.stalemate && b.stalemate) {
        return 1;
      }

      // Compare by insufficient material.
      if (a.insufficient_material && !b.insufficient_material) {
        return -1;
      } else if (!a.insufficient_material && b.insufficient_material) {
        return 1;
      }

      // Compare by zeroing.
      if (a.dtz < 0 && b.dtz < 0 && a.zeroing && !b.zeroing) {
        return -1;
      } else if (a.dtz < 0 && b.dtz < 0 && !a.zeroing && b.zeroing) {
        return 1;
      }

      // Compare by DTZ.
      if (a.dtz < b.dtz || (a.dtz === null && b.dtz !== null)) {
        return 1;
      } else if (a.dtz > b.dtz || (a.dtz !== null && b.dtz === null)) {
        return -1;
      }

      // Compare by UCI notation.
      if (a.uci < b.uci) {
        return -1;
      } else if (a.uci > b.uci) {
        return 1;
      } else {
        return 0;
      }
    });

    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];

      var badge = 'Unknown';
      if (move.checkmate) {
        badge = 'Checkmate';
      } else if (move.stalemate) {
        badge = 'Stalemate';
      } else if (move.insufficient_material) {
        badge = 'Insufficient material';
      } else if (move.dtz === 0) {
        badge = 'Draw';
      } else if (move.dtz !== null) {
        if (move.zeroing && move.dtz < 0) {
          badge = 'Zeroing';
        } else if (move.dtz < 0) {
          badge = 'Win with DTZ ' + Math.abs(move.dtz);
        } else {
          badge = 'Loss with DTZ ' + move.dtz;
        }
      }

      var moveLink = $('<a class="list-group-item"></a>')
        .attr({
          'data-uci': move.uci,
          'data-fen': move.fen,
          'href': '/?fen=' + move.fen
        })
        .append(move.san)
        .append(' ')
        .append($('<span class="badge"></span>').text(badge))
        .click(handleMoveClick)
        .mouseenter(handleMoveMouseEnter)
        .mouseleave(handleMoveMouseLeave);

      if (move.winning) {
        moveLink.appendTo($winning);
      } else if (move.drawing) {
        moveLink.appendTo($drawing);
      } else {
        moveLink.appendTo($losing);
      }
    }
  }

  function probe(fen, push) {
    if (push && 'pushState' in history) {
      history.pushState({ fen: fen }, null, '/?fen=' + fen);
    }

    if (request) {
      request.abort();
      request = null;
    }

    var tmpChess = new Chess(fen);

    // Remove outdated moves
    $winning.empty().toggleClass('white-turn', tmpChess.turn() == 'w').toggleClass('black-turn', tmpChess.turn() == 'b');
    $drawing.empty();
    $losing.empty().toggleClass('white-turn', tmpChess.turn() == 'w').toggleClass('black-turn', tmpChess.turn() == 'b');

    // Handle the default FEN.
    if (fen == '4k3/8/8/8/8/8/8/4K3 w - - 0 1') {
      $status.text('Draw by insufficient material').removeClass('black-win').removeClass('white-win');
      $info.html('<p>Syzygy tablebases provide win-draw-loss and distance-to-zero information for all endgame positions with up to 6 pieces.</p><p>Minmaxing the DTZ values guarantees winning all winning positions and defending all drawn positions.</p><p><strong>Setup a position on the board to probe the tablebases.</strong></p>');
      return;
    }

    if (fen == 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
      // Handle the normal chess starting position.
      $status.text('Position not found in tablebases').removeClass('black-win').removeClass('white-win');
      $info.html('<p><a href="https://en.wikipedia.org/wiki/Solving_chess">Chess is not yet solved.</a></p>');
    } else if (tmpChess.in_checkmate()) {
      // Handle checkmate.
      if (tmpChess.turn() == 'b') {
        $status.text('White won by checkmate').removeClass('black-win').addClass('white-win');
      } else {
        $status.text('Black won by checkmate').removeClass('white-win').addClass('black-win');
      }
      $info.empty();
    } else if (tmpChess.in_stalemate()) {
      // Handle stalemate.
      $status.text('Draw by stalemate').removeClass('black-win').removeClass('white-win');
      $info.empty();
    } else if (tmpChess.insufficient_material()) {
      // Handle insufficient material.
      $status.text('Draw by insufficient material').removeClass('black-win').removeClass('white-win');
      $info.html('<p><strong>The game is drawn</strong> because with the remaining material no sequence of legal moves can lead to a checkmate.</p>');
    } else {
      $info.empty();
    }

    // Show loading spinner.
    $info.append('<div class="spinner"><div class="double-bounce1"></div><div class="double-bounce2"></div></div>');

    if (cache[fen]) {
      handleProbeSuccess(tmpChess, cache[fen]);
    } else {
      request = $.ajax('/api', {
        data: {
          'fen': fen,
        },
        error: function (xhr, textStatus, errorThrown) {
          handleProbeError(xhr.status, textStatus);
        },
        success: function (data) {
          cache[fen] = data;
          handleProbeSuccess(tmpChess, data);
        }
      });
    }
  }

  if ($('#board').length) {
    board = new ChessBoard('board', {
      position: $('#board').attr('data-fen'),
      pieceTheme: '/static/chesspieces/wikipedia/{piece}.png',
      draggable: true,
      dropOffBoard: 'trash',
      sparePieces: true,
      onDrop: function (source, target, piece, newPos, oldPos, orientation) {
        // If it is a legal move, do it.
        var oldFen = ChessBoard.objToFen(oldPos) + ' ' + ($btn_white.hasClass('active') ? 'w' : 'b') + ' - - 0 1';
        if (source != 'spare' && target != 'trash' && chess.load(oldFen)) {
          var moves = chess.moves({ verbose: true });
          for (var i = 0; i < moves.length; i++) {
            if (!moves[i].promotion && moves[i].from == source && moves[i].to == target) {
              chess.move(moves[i]);
              $btn_white.toggleClass('active', chess.turn() == 'w');
              $btn_black.toggleClass('active', chess.turn() == 'b');
              var parts = chess.fen().split(/ /);
              parts[4] = '0';
              parts[5] = '1';
              var fen = parts.join(' ');
              $fen.val(fen);
              chess.load(fen);
              probe(fen);
              return;
            }
          }
        }

        // Otherwise just change the position.
        var fen = ChessBoard.objToFen(newPos) + ' ' + ($btn_white.hasClass('active') ? 'w' : 'b') + ' - - 0 1';
        $fen.val(fen);
        chess.load(fen);
        probe(fen, true);
      }
    });
    chess.load($('#board').attr('data-fen'));
  }

  var $btn_white = $('#btn-white');
  var $btn_black = $('#btn-black');
  var $fen = $('#fen');

  $btn_white.click(function (event) {
    event.preventDefault();
    var fen = board.fen() + ' w - - 0 1';
    chess.load(fen);
    $fen.val(fen);
    $btn_white.addClass('active');
    $btn_black.removeClass('active');
    probe(fen, true);
  });

  $btn_black.click(function (event) {
    event.preventDefault();
    var fen = board.fen() + ' b - - 0 1';
    chess.load(fen);
    $fen.val(fen);
    $btn_white.removeClass('active');
    $btn_black.addClass('active');
    probe(fen, true);
  });

  $('#form-set-fen').submit(function (event) {
    event.preventDefault();

    var parts = $fen.val().trim().split(/\s+/);
    if (parts.length == 1) {
      parts.push($btn_white.hasClass('active') ? 'w' : 'b');
    }
    if (parts.length == 2) {
      parts.push('-');
    }
    if (parts.length == 3) {
      parts.push('-');
    }
    if (parts.length == 4) {
      parts.push('0');
    }
    if (parts.length == 5) {
      parts.push('1');
    }

    var fen = parts.join(' ');
    if (!chess.load(fen)) {
      fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
      chess.load(fen);
    }

    board.position(fen);
    $fen.val(fen);
    chess.load(fen);
    probe(fen, true);
  });

  window.addEventListener('popstate', function (event) {
    var fen = null;
    if (event.state && event.state.fen) {
      fen = event.state.fen;
    } else {
      var query = decodeQuery();
      fen = query.fen || '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    }

    $fen.val(fen);
    board.position(fen);
    chess.load(fen);
    $btn_white.toggleClass('active', fen.indexOf(' w ') > -1);
    $btn_black.toggleClass('active', fen.indexOf(' w ') == -1);
    probe(fen, false);
  });

  $('h1 a').click(function (event) {
    event.preventDefault();
    $fen.val('');
    board.position('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    chess.load('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    $btn_white.addClass('active');
    $btn_black.removeClass('active');
    probe('4k3/8/8/8/8/8/8/4K3 w - - 0 1', true);
  });

  $('.list-group-item')
    .click(handleMoveClick)
    .mouseover(handleMoveMouseEnter)
    .mouseleave(handleMoveMouseLeave);

  $('#btn-flip-board').click(function (event) {
    board.flip();
  });

  $('#btn-swap-colors').click(function (event) {
    event.preventDefault();

    var parts = chess.fen().split(/\s+/);
    var fen = '';

    for (var i = 0; i < parts[0].length; i++) {
      if (parts[0][i] === parts[0][i].toLowerCase()) {
        fen += parts[0][i].toUpperCase();
      } else {
        fen += parts[0][i].toLowerCase();
      }
    }

    fen += ' ' + parts[1] + ' - - 0 1';
    $fen.val(fen);
    board.position(fen);
    chess.load(fen);
    probe(fen, true);
  });

  $('#btn-mirror-horizontal').click(function (event) {
    event.preventDefault();

    var parts = chess.fen().split(/\s+/);
    var positionParts = parts[0].split(/\//);
    for (var i = 0; i < positionParts.length; i++) {
      positionParts[i] = positionParts[i].split('').reverse().join('');
    }

    var fen = positionParts.join('/') + ' ' + parts[1] + ' - - 0 1';

    $fen.val(fen);
    board.position(fen);
    chess.load(fen);
    probe(fen, true);
  });

  $('#btn-mirror-vertical').click(function (event) {
    event.preventDefault();

    var parts = chess.fen().split(/\s+/);
    var positionParts = parts[0].split(/\//);
    positionParts.reverse();

    var fen = positionParts.join('/') + ' '+ parts[1] + ' - - 0 1';
    $fen.val(fen);
    board.position(fen);
    chess.load(fen);
    probe(fen, true);
  });
});